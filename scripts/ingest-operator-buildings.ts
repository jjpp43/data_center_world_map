/**
 * Ingest H5 / Vantage / Aligned JSONL: enrich matched canonicals (specs +
 * source_records) and insert unmatched rows as new facilities.
 *
 * Matcher: exact name → operator+name prefix → operator+code regex → same
 * city only when campus phase is compatible. "I" may match an unnumbered
 * original; II/III never match I or an unnumbered sibling. Prefix match
 * rejects "Milan I" hitting "Milan II" (roman I is a prefix of II/III).
 * Multiple hits → skip (ambiguous). No spatial branch.
 *
 * Run:
 *   npm run ingest:buildings            # dry-run
 *   npm run ingest:buildings -- --apply
 *   npm run ingest:buildings -- --only=h5 --apply
 *   npm run ingest:buildings -- --only=nextdc --apply
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { refreshSummaryViews, triggerCatalogFreshness } from "./_trigger-rebuild";

function argValue(name: string): string | null {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1) || null;
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const APPLY = process.argv.includes("--apply");
const ONLY = argValue("--only")?.toLowerCase() ?? null;
const OUT = path.join(process.cwd(), "scrapers/out");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAPBOX = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
if (!URL || !KEY || !MAPBOX) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_MAPBOX_TOKEN");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

type Job = {
  key: string;
  file: string;
  operator: string;
  aliases: string[];
};

const JOBS: Job[] = [
  { key: "h5", file: "facilities.h5.jsonl", operator: "H5 Data Centers", aliases: ["H5"] },
  { key: "vantage", file: "facilities.vantage.jsonl", operator: "Vantage Data Centers", aliases: ["Vantage"] },
  { key: "aligned", file: "facilities.aligned.jsonl", operator: "Aligned Data Centers", aliases: ["Aligned", "ODATA"] },
  { key: "nextdc", file: "facilities.nextdc.jsonl", operator: "NEXTDC", aliases: ["NEXTDC Sdn Bhd"] },
  {
    key: "stack",
    file: "facilities.stack.jsonl",
    operator: "STACK Infrastructure",
    aliases: ["Stack Infrastructure", "STACK infrastructure Switzerland S.A."],
  },
];

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
  status: "operational" | "planned" | "under_construction";
  specs?: Record<string, unknown> | null;
  certifications?: string[] | null;
  sources: Array<{
    source: string;
    source_id: string;
    source_url: string;
    fetched_at: string;
    raw: unknown;
  }>;
}

const ENRICH_SPEC_FIELDS = [
  "power_mw",
  "power_redundancy",
  "space_sqft",
  "space_sqm",
  "tier",
  "year_built",
  "cooling",
  "pue",
  "site_acres",
  "generator_redundancy",
] as const;

async function readJsonl<T>(p: string): Promise<T[]> {
  const txt = await fs.readFile(p, "utf8");
  return txt.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

async function geocode(query: string, country?: string): Promise<{ lat: number; lng: number; country: string } | null> {
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

function campusPhase(name: string, code?: string | null): string | null {
  const roman = name.match(/\b(IV|III|II|I)\s*$/i);
  if (roman?.[1]) return roman[1].toUpperCase();
  const hyphen =
    (code ?? "").match(/^[A-Z]{2,5}-(\d{2})$/i) ?? name.match(/\b[A-Z]{2,5}-(\d{2})\b/i);
  if (!hyphen?.[1]) return null;
  const n = Number(hyphen[1]);
  if (n === 1) return "I";
  if (n === 2) return "II";
  if (n === 3) return "III";
  if (n === 4) return "IV";
  return String(n);
}

function phasesCompatible(scrapedName: string, existingName: string, scrapedCode?: string | null): boolean {
  const a = campusPhase(scrapedName, scrapedCode);
  const b = campusPhase(existingName);
  if (a === b) return true;
  if (a === "I" && b === null) return true;
  if (a === null && b === "I") return true;
  return false;
}

function prefixHitOk(scrapedName: string, existingName: string, scrapedCode?: string | null): boolean {
  if (!phasesCompatible(scrapedName, existingName, scrapedCode)) return false;
  const s = scrapedName.toLowerCase();
  const e = existingName.toLowerCase();
  if (e === s) return true;
  if (!e.startsWith(s)) return true;
  const rest = e.slice(s.length);
  if (/^i+\b/.test(rest)) return false;
  return true;
}

function operatorFilters(job: Job, scrapedOperator: string): string[] {
  const set = new Set<string>([job.operator, scrapedOperator, ...job.aliases]);
  return [...set].filter(Boolean);
}

type Match = { kind: "hit"; id: string } | { kind: "ambiguous" } | { kind: "miss" };

async function findExisting(job: Job, r: ScrapedFacility): Promise<Match> {
  const ops = operatorFilters(job, r.operator);

  const take = (rows: Array<{ id: string }> | null): Match => {
    if (!rows || rows.length === 0) return { kind: "miss" };
    if (rows.length > 1) return { kind: "ambiguous" };
    return { kind: "hit", id: rows[0]!.id };
  };

  const takeNamed = (
    rows: Array<{ id: string; name: string | null }> | null,
    ok: (name: string) => boolean,
  ): Match => {
    const hits = (rows ?? []).filter((row) => row.name && ok(row.name));
    return take(hits);
  };

  for (const op of ops) {
    const { data } = await sb.from("data_centers").select("id").eq("operator", op).eq("name", r.name).limit(2);
    const m = take(data);
    if (m.kind !== "miss") return m;
  }

  for (const op of ops) {
    const { data } = await sb
      .from("data_centers")
      .select("id, name")
      .ilike("operator", `${op}%`)
      .ilike("name", `${r.name}%`)
      .limit(10);
    const m = takeNamed(data, (name) => prefixHitOk(r.name, name, r.code));
    if (m.kind !== "miss") return m;
  }

  if (r.code) {
    const escaped = r.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const op of ops) {
      const { data } = await sb
        .from("data_centers")
        .select("id")
        .ilike("operator", `${op}%`)
        .filter("name", "imatch", `\\m${escaped}\\M`)
        .limit(2);
      const m = take(data);
      if (m.kind !== "miss") return m;
    }
  }

  if (r.location.city) {
    for (const op of ops) {
      const { data } = await sb
        .from("data_centers")
        .select("id, name")
        .ilike("operator", `${op}%`)
        .eq("city", r.location.city)
        .limit(10);
      const m = takeNamed(data, (name) => {
        if (r.code) {
          const escaped = r.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`, "i").test(name);
        }
        return phasesCompatible(r.name, name, r.code);
      });
      if (m.kind !== "miss") return m;
    }
  }

  return { kind: "miss" };
}

function specUpdates(r: ScrapedFacility): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const s = (r.specs ?? {}) as Record<string, unknown>;
  for (const k of ENRICH_SPEC_FIELDS) {
    const v = s[k];
    if (v !== null && v !== undefined && v !== "") updates[k] = v;
  }
  if (typeof updates.space_sqft === "number") updates.space_sqft = Math.round(updates.space_sqft);
  if (r.certifications && r.certifications.length > 0) updates.certifications = r.certifications;
  if (r.code) updates.code = r.code;
  if (r.location.address) updates.address = r.location.address;
  if (r.location.city && !/\([A-Z]{2}\)/.test(r.location.city)) updates.city = r.location.city;
  if (r.location.region) updates.region = r.location.region;
  if (r.location.postal_code) updates.postal_code = r.location.postal_code;
  return updates;
}

async function upsertSources(dataCenterId: string, r: ScrapedFacility): Promise<string | null> {
  for (const s of r.sources) {
    const { error } = await sb.from("source_records").upsert(
      {
        data_center_id: dataCenterId,
        source: s.source,
        source_id: s.source_id,
        source_url: s.source_url,
        raw: s.raw,
        fetched_at: s.fetched_at,
      },
      { onConflict: "source,source_id" },
    );
    if (error) return `${s.source}/${s.source_id}: ${error.message}`;
  }
  return null;
}

async function locate(r: ScrapedFacility): Promise<{ lat: number; lng: number; country: string } | null> {
  if (r.location.lat != null && r.location.lng != null) {
    return { lat: r.location.lat, lng: r.location.lng, country: r.location.country };
  }
  const q = [r.location.address, r.location.city, r.location.region, r.location.country]
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  return geocode(q, r.location.country);
}

async function ingestJob(job: Job): Promise<{
  inserted: number;
  enriched: number;
  ambiguous: number;
  skipped: number;
  errors: number;
}> {
  const file = path.join(OUT, job.file);
  const recs = await readJsonl<ScrapedFacility>(file);
  console.log(`\n# ${job.operator} (${recs.length} records)\n`);

  const slugs = recs.map((r) => r.slug);
  const { data: existing } = await sb.from("data_centers").select("id, slug").in("slug", slugs);
  const bySlug = new Map((existing ?? []).map((r) => [r.slug, r.id as string]));

  let inserted = 0;
  let enriched = 0;
  let ambiguous = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of recs) {
    const existingId = bySlug.get(r.slug);
    let match: Match = existingId ? { kind: "hit", id: existingId } : await findExisting(job, r);

    if (match.kind === "ambiguous") {
      ambiguous++;
      console.log(`  AMBIG ${r.slug} (${r.name})`);
      continue;
    }

    if (match.kind === "hit") {
      const updates = specUpdates(r);
      if (APPLY) {
        if (Object.keys(updates).length > 0) {
          const { error } = await sb.from("data_centers").update(updates).eq("id", match.id);
          if (error) {
            errors++;
            console.log(`  ✗ enrich ${r.slug}: ${error.message}`);
            continue;
          }
        }
        const srcErr = await upsertSources(match.id, r);
        if (srcErr) console.log(`  ⚠ sources ${r.slug}: ${srcErr}`);
      }
      enriched++;
      const bits = [
        r.specs?.power_mw != null ? `${r.specs.power_mw} MW` : null,
        r.specs?.space_sqft != null ? `${r.specs.space_sqft} sqft` : null,
      ].filter(Boolean);
      console.log(`  ENRICH ${r.slug} → ${match.id.slice(0, 8)} ${bits.join(" · ")}`);
      continue;
    }

    const loc = await locate(r);
    if (!loc) {
      errors++;
      console.log(`  ✗ geocode ${r.slug}`);
      continue;
    }

    const row = {
      slug: r.slug,
      name: r.name,
      operator: r.operator,
      address: r.location.address,
      city: r.location.city,
      region: r.location.region,
      country: loc.country.slice(0, 2),
      postal_code: r.location.postal_code,
      lat: loc.lat,
      lng: loc.lng,
      status: r.status,
      power_mw: typeof r.specs?.power_mw === "number" ? r.specs.power_mw : null,
      space_sqft: typeof r.specs?.space_sqft === "number" ? Math.round(r.specs.space_sqft) : null,
      space_sqm: typeof r.specs?.space_sqm === "number" ? Math.round(r.specs.space_sqm) : null,
      tier: typeof r.specs?.tier === "string" ? r.specs.tier : null,
      year_built: typeof r.specs?.year_built === "number" ? r.specs.year_built : null,
      cooling: typeof r.specs?.cooling === "string" ? r.specs.cooling : null,
      pue: typeof r.specs?.pue === "number" ? r.specs.pue : null,
      site_acres: typeof r.specs?.site_acres === "number" ? r.specs.site_acres : null,
      code: r.code,
      website: r.sources[0]?.source_url ?? null,
      certifications: r.certifications ?? null,
    };

    if (APPLY) {
      const { data: ins, error } = await sb.from("data_centers").insert(row).select("id").single();
      if (error || !ins) {
        errors++;
        console.log(`  ✗ insert ${r.slug}: ${error?.message ?? "unknown"}`);
        continue;
      }
      const srcErr = await upsertSources(ins.id, r);
      if (srcErr) console.log(`  ⚠ sources ${r.slug}: ${srcErr}`);
    }
    inserted++;
    console.log(
      `  NEW   ${r.slug} → ${row.operator} @ (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}, ${loc.country}) — ${r.location.city ?? "—"}`,
    );
  }

  console.log(
    `\n  ${job.key}: inserted=${inserted} enriched=${enriched} ambiguous=${ambiguous} skipped=${skipped} errors=${errors}`,
  );
  return { inserted, enriched, ambiguous, skipped, errors };
}

async function main() {
  const jobs = ONLY ? JOBS.filter((j) => j.key === ONLY) : JOBS;
  if (jobs.length === 0) {
    console.error(`Unknown --only=${ONLY}. Expected one of ${JOBS.map((j) => j.key).join(", ")}`);
    process.exit(1);
  }
  console.log(`# Operator buildings ingest (${APPLY ? "APPLY" : "DRY-RUN"})\n`);

  const totals = { inserted: 0, enriched: 0, ambiguous: 0, skipped: 0, errors: 0 };
  for (const job of jobs) {
    const r = await ingestJob(job);
    totals.inserted += r.inserted;
    totals.enriched += r.enriched;
    totals.ambiguous += r.ambiguous;
    totals.skipped += r.skipped;
    totals.errors += r.errors;
  }

  console.log("\n## Total\n");
  console.log(`- Inserted:   **${totals.inserted}**`);
  console.log(`- Enriched:   **${totals.enriched}**`);
  console.log(`- Ambiguous:  **${totals.ambiguous}**`);
  console.log(`- Errors:     **${totals.errors}**`);
  if (!APPLY) console.log("\nRe-run with `--apply` to commit.");
  if (APPLY) {
    await refreshSummaryViews();
    await triggerCatalogFreshness("ingest-operator-buildings");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
