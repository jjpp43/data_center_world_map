/**
 * Phase 9 — canonicalize 234 operator-page orphans.
 *
 * Reads scrapers/out/orphans.operator-pages.jsonl + the corresponding
 * facilities.{op}.jsonl source records. For each orphan:
 *   1. Skip if slug already present in data_centers.
 *   2. Determine lat/lng + country:
 *        - if source has lat/lng, use it (and reverse-geocode for country sanity)
 *        - else forward-geocode the street address
 *        - else forward-geocode the city + country
 *        - else skip + log
 *   3. Re-run match_data_center (250m). If it hits an existing canonical,
 *      link source_records to that instead of inserting a duplicate.
 *   4. Else insert into data_centers + source_records.
 *
 * Run:
 *   npm run canonicalize:orphans            # dry-run (default, no DB writes)
 *   npm run canonicalize:orphans -- --apply # actually insert
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const OUT = path.join(process.cwd(), "scrapers/out");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
if (!URL || !KEY || !MAPBOX) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_MAPBOX_TOKEN");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const CANONICAL_OPERATOR: Record<string, string> = {
  Equinix: "Equinix, Inc.",
  CyrusOne: "CyrusOne Inc.",
  "Digital Realty": "Digital Realty",
  DataBank: "DataBank, Ltd.",
  Cologix: "Cologix, Inc.",
  CoreSite: "CoreSite",
  QTS: "QTS Realty Trust, Inc.",
};

interface Orphan {
  op: string;
  slug: string;
  name: string;
  url: string;
}

interface SourceRecord {
  slug: string;
  name: string;
  operator: string | null;
  code?: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  };
  specs?: {
    power_mw: number | null;
    space_sqft: number | null;
    tier: string | null;
    year_built: number | null;
    cooling: string | null;
    pue: number | null;
  } | null;
  sources?: Array<{
    source: string;
    source_id: string;
    source_url: string;
    fetched_at: string;
    raw: unknown;
  }>;
}

async function readJsonl<T>(p: string): Promise<T[]> {
  const txt = await fs.readFile(p, "utf8").catch(() => "");
  return txt
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

interface GeoHit {
  lat: number;
  lng: number;
  country: string;
}

async function forwardGeocode(query: string, country?: string): Promise<GeoHit | null> {
  const encoded = encodeURIComponent(query);
  const params = new URLSearchParams({ access_token: MAPBOX, limit: "1" });
  if (country) params.set("country", country.toLowerCase());
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: Array<{
      center?: [number, number];
      context?: Array<{ id?: string; short_code?: string }>;
    }>;
  };
  const f = data.features?.[0];
  if (!f?.center) return null;
  const [lng, lat] = f.center;
  const countryCtx = (f.context ?? []).find((c) => c.id?.startsWith("country."));
  const cc = (countryCtx?.short_code ?? country ?? "").toUpperCase();
  return { lat, lng, country: cc };
}

async function reverseGeocodeCountry(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({
    access_token: MAPBOX,
    types: "country",
    limit: "1",
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: Array<{ properties?: { short_code?: string } }> };
  return data.features?.[0]?.properties?.short_code?.toUpperCase() ?? null;
}

async function locate(src: SourceRecord): Promise<GeoHit | null> {
  // Tier A: have lat/lng — validate country via reverse geocode.
  if (src.location.lat != null && src.location.lng != null) {
    const cc = await reverseGeocodeCountry(src.location.lat, src.location.lng);
    return {
      lat: src.location.lat,
      lng: src.location.lng,
      country: cc ?? src.location.country.toUpperCase(),
    };
  }
  // Tier B: have street address — forward geocode.
  if (src.location.address) {
    const parts = [
      src.location.address,
      src.location.postal_code,
      src.location.city,
      src.location.region,
      src.location.country,
    ].filter(Boolean);
    const query = parts.join(", ");
    const hit = await forwardGeocode(query, src.location.country);
    if (hit) return hit;
  }
  // Tier C: only city + country.
  if (src.location.city && src.location.country) {
    return await forwardGeocode(
      `${src.location.city}, ${src.location.country}`,
      src.location.country,
    );
  }
  return null;
}

interface Stats {
  byOperator: Map<string, number>;
  inserted: number;
  linkedExisting: number;
  skippedSlugExists: number;
  skippedNoLocation: number;
  errors: number;
}

async function main() {
  console.log(`# Orphan canonicalization (${APPLY ? "APPLY" : "DRY-RUN"})\n`);

  const orphans = await readJsonl<Orphan>(path.join(OUT, "orphans.operator-pages.jsonl"));
  console.log(`Orphans: ${orphans.length}\n`);

  // Load all source records into a slug map
  const sourceFiles = [
    "facilities.equinix.jsonl",
    "facilities.digital-realty.jsonl",
    "facilities.databank.jsonl",
    "facilities.cologix.jsonl",
    "facilities.coresite.jsonl",
    "facilities.cyrusone.jsonl",
    "facilities.qts.jsonl",
  ];
  const sourceBySlug = new Map<string, SourceRecord>();
  for (const f of sourceFiles) {
    const recs = await readJsonl<SourceRecord>(path.join(OUT, f));
    for (const r of recs) sourceBySlug.set(r.slug, r);
  }

  // Check which slugs already exist in DB
  const slugs = orphans.map((o) => o.slug);
  const { data: existing } = await sb
    .from("data_centers")
    .select("slug")
    .in("slug", slugs);
  const existingSlugs = new Set((existing ?? []).map((r) => r.slug));

  const stats: Stats = {
    byOperator: new Map(),
    inserted: 0,
    linkedExisting: 0,
    skippedSlugExists: 0,
    skippedNoLocation: 0,
    errors: 0,
  };

  for (let i = 0; i < orphans.length; i++) {
    const o = orphans[i];
    process.stdout.write(`  ${i + 1}/${orphans.length}\r`);

    if (existingSlugs.has(o.slug)) {
      stats.skippedSlugExists++;
      continue;
    }

    const src = sourceBySlug.get(o.slug);
    if (!src) {
      stats.errors++;
      continue;
    }

    const loc = await locate(src);
    if (!loc) {
      stats.skippedNoLocation++;
      console.log(`\n  ⚠ no location: ${o.slug}`);
      continue;
    }

    const canonicalOp = CANONICAL_OPERATOR[o.op] ?? o.op;

    // Re-match in case an existing canonical now sits within 250m
    const { data: matched } = await sb.rpc("match_data_center", {
      p_operator: canonicalOp,
      p_name: src.name,
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_radius_m: 250,
    });
    const matchedId = (matched as string | null) ?? null;

    if (matchedId) {
      // Link source_records to the matched canonical (if not already linked)
      if (APPLY && src.sources?.length) {
        for (const s of src.sources) {
          await sb
            .from("source_records")
            .upsert(
              {
                data_center_id: matchedId,
                source: s.source,
                source_id: s.source_id,
                source_url: s.source_url ?? null,
                raw: s.raw,
                fetched_at: s.fetched_at,
              },
              { onConflict: "source,source_id", ignoreDuplicates: true },
            );
        }
      }
      stats.linkedExisting++;
      stats.byOperator.set(o.op, (stats.byOperator.get(o.op) ?? 0) + 1);
      continue;
    }

    // Insert as new canonical
    const row = {
      slug: o.slug,
      name: src.name,
      operator: canonicalOp,
      address: src.location.address,
      city: src.location.city,
      region: src.location.region,
      country: loc.country.slice(0, 2),
      postal_code: src.location.postal_code,
      lat: loc.lat,
      lng: loc.lng,
      status: "operational" as const,
      power_mw: src.specs?.power_mw ?? null,
      space_sqft: src.specs?.space_sqft ?? null,
      tier: src.specs?.tier ?? null,
      year_built: src.specs?.year_built ?? null,
      cooling: src.specs?.cooling ?? null,
      pue: src.specs?.pue ?? null,
      website: o.url || null,
    };

    if (APPLY) {
      const { data: inserted, error } = await sb
        .from("data_centers")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        console.log(`\n  ✗ ${o.slug}: ${error.message}`);
        stats.errors++;
        continue;
      }
      if (src.sources?.length && inserted) {
        for (const s of src.sources) {
          await sb.from("source_records").upsert(
            {
              data_center_id: inserted.id,
              source: s.source,
              source_id: s.source_id,
              source_url: s.source_url ?? null,
              raw: s.raw,
              fetched_at: s.fetched_at,
            },
            { onConflict: "source,source_id", ignoreDuplicates: true },
          );
        }
      }
    }
    stats.inserted++;
    stats.byOperator.set(o.op, (stats.byOperator.get(o.op) ?? 0) + 1);
  }

  // Report
  console.log("\n## Result\n");
  console.log(`- Inserted as new canonical: **${stats.inserted}**`);
  console.log(`- Linked to existing canonical (slipped past first ingest): **${stats.linkedExisting}**`);
  console.log(`- Skipped (slug already in DB):                              **${stats.skippedSlugExists}**`);
  console.log(`- Skipped (no usable location):                              **${stats.skippedNoLocation}**`);
  console.log(`- Errors:                                                    **${stats.errors}**`);
  console.log();
  console.log("## Resolved by operator\n");
  for (const [op, n] of [...stats.byOperator.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${op}: ${n}`);
  }
  console.log();
  if (!APPLY) {
    console.log("Re-run with `npm run canonicalize:orphans -- --apply` to commit changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
