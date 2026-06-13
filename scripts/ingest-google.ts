/**
 * Ingest facilities.google.jsonl into data_centers + source_records.
 *
 * Google ships only "City, Region/Country" + status (operational | planned).
 * No street address, no lat/lng. We forward-geocode each row via Mapbox.
 *
 * Strict 3-tier matcher (operator-scoped exact/prefix/code-regex, no spatial)
 * — matches the Phase 9 / Iron Mountain pattern.
 *
 * Run:
 *   npm run ingest:google            # dry-run
 *   npm run ingest:google -- --apply # commit
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { triggerRebuild } from "./_trigger-rebuild";

const APPLY = process.argv.includes("--apply");
const OUT = path.join(process.cwd(), "scrapers/out");
const FILE = path.join(OUT, "facilities.google.jsonl");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
if (!URL || !KEY || !MAPBOX) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_MAPBOX_TOKEN");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const OPERATOR = "Google";

interface ScrapedFacility {
  slug: string;
  name: string;
  operator: string;
  campus: string | null;
  code: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  };
  status: "operational" | "planned";
  sources: Array<{
    source: "google-com";
    source_id: string;
    source_url: string;
    fetched_at: string;
    raw: unknown;
  }>;
}

async function readJsonl<T>(p: string): Promise<T[]> {
  const txt = await fs.readFile(p, "utf8");
  return txt.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

interface GeoHit { lat: number; lng: number; country: string }

async function geocode(query: string, country?: string): Promise<GeoHit | null> {
  const params = new URLSearchParams({ access_token: MAPBOX, limit: "1" });
  if (country) params.set("country", country.toLowerCase());
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: Array<{ center?: [number, number]; context?: Array<{ id?: string; short_code?: string }> }>;
  };
  const f = data.features?.[0];
  if (!f?.center) return null;
  const [lng, lat] = f.center;
  const countryCtx = (f.context ?? []).find((c) => c.id?.startsWith("country."));
  const cc = (countryCtx?.short_code ?? country ?? "").toUpperCase();
  return { lat, lng, country: cc };
}

async function findExisting(operator: string, name: string, code: string | null): Promise<string | null> {
  const { data: t1 } = await sb
    .from("data_centers")
    .select("id")
    .eq("operator", operator)
    .eq("name", name)
    .limit(1);
  if (t1?.[0]) return t1[0].id;
  const { data: t2 } = await sb
    .from("data_centers")
    .select("id")
    .ilike("operator", `${operator}%`)
    .ilike("name", `${name}%`)
    .limit(1);
  if (t2?.[0]) return t2[0].id;
  if (code) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const { data: t3 } = await sb
      .from("data_centers")
      .select("id")
      .ilike("operator", `${operator}%`)
      .filter("name", "imatch", `\\m${escaped}\\M`)
      .limit(1);
    if (t3?.[0]) return t3[0].id;
  }
  return null;
}

async function main() {
  console.log(`# Google buildings ingest (${APPLY ? "APPLY" : "DRY-RUN"})\n`);
  const recs = await readJsonl<ScrapedFacility>(FILE);
  console.log(`Records: ${recs.length}\n`);

  const slugs = recs.map((r) => r.slug);
  const { data: existing } = await sb.from("data_centers").select("slug").in("slug", slugs);
  const existingSlugs = new Set((existing ?? []).map((r) => r.slug));

  let inserted = 0;
  let linked = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of recs) {
    if (existingSlugs.has(r.slug)) {
      skipped++;
      continue;
    }
    const q = [r.location.city, r.location.region, r.location.country].filter(Boolean).join(", ");
    const hit = await geocode(q, r.location.country);
    if (!hit) {
      errors++;
      console.log(`  ✗ geocode failed: ${r.slug} (${q})`);
      continue;
    }
    const matched = await findExisting(OPERATOR, r.name, r.code);
    if (matched) {
      if (APPLY) {
        for (const s of r.sources) {
          await sb.from("source_records").upsert(
            {
              data_center_id: matched,
              source: s.source,
              source_id: s.source_id,
              source_url: s.source_url,
              raw: s.raw,
              fetched_at: s.fetched_at,
            },
            { onConflict: "source,source_id", ignoreDuplicates: true },
          );
        }
      }
      linked++;
      console.log(`  LINK ${r.slug} → ${matched.slice(0, 8)}`);
      continue;
    }
    const row = {
      slug: r.slug,
      name: r.name,
      operator: OPERATOR,
      address: null,
      city: r.location.city,
      region: r.location.region,
      country: hit.country.slice(0, 2),
      postal_code: null,
      lat: hit.lat,
      lng: hit.lng,
      status: r.status,
      power_mw: null,
      space_sqft: null,
      tier: null,
      year_built: null,
      cooling: null,
      pue: null,
      website: r.sources[0]?.source_url ?? null,
    };
    if (APPLY) {
      const { data: ins, error } = await sb
        .from("data_centers")
        .insert(row)
        .select("id")
        .single();
      if (error || !ins) {
        errors++;
        console.log(`  ✗ ${r.slug}: ${error?.message ?? "unknown"}`);
        continue;
      }
      for (const s of r.sources) {
        await sb.from("source_records").upsert(
          {
            data_center_id: ins.id,
            source: s.source,
            source_id: s.source_id,
            source_url: s.source_url,
            raw: s.raw,
            fetched_at: s.fetched_at,
          },
          { onConflict: "source,source_id", ignoreDuplicates: true },
        );
      }
    }
    inserted++;
    console.log(`  NEW  ${r.slug} → (${hit.lat.toFixed(3)}, ${hit.lng.toFixed(3)}, ${hit.country}) ${r.status === "planned" ? "[planned]" : ""}`);
  }

  console.log("\n## Result\n");
  console.log(`- Inserted: **${inserted}**`);
  console.log(`- Linked:   **${linked}**`);
  console.log(`- Skipped:  **${skipped}**`);
  console.log(`- Errors:   **${errors}**`);
  if (!APPLY) console.log("\nRe-run with `--apply` to commit.");
  if (APPLY) await triggerRebuild("ingest-google");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
