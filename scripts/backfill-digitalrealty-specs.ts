/**
 * Backfill Digital Realty facility specs from raw payloads ALREADY stored in
 * source_records — no new scraping, no network fetch. The `digitalrealty-com`
 * scraper captured a Drupal `field_*` payload per facility but the ingest
 * mapper only lifted a couple of fields, leaving power/pue/redundancy/etc. at
 * ~0% on our #2 operator (220 facilities). This maps the rest into the empty
 * columns.
 *
 * Fill-only-NULL: never overwrites a column that already has a value (space +
 * ups_redundancy are partially mapped and stay as-is).
 *
 * Combined sites (e.g. AMS15-16 = 2 source records under one facility): additive
 * fields (power, space) are SUMMED; categorical fields take the first non-empty.
 *
 * Run:
 *   npm run backfill:dr             # dry-run (default)
 *   npm run backfill:dr -- --apply  # commit
 *   npm run backfill:dr -- --apply --rebuild   # + force a Vercel deploy
 */
import { createClient } from "@supabase/supabase-js";
import { refreshSummaryViews, triggerRebuild } from "./_trigger-rebuild";

const APPLY = process.argv.includes("--apply");
const OPERATOR = "Digital Realty";
const SOURCE = "digitalrealty-com";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

type Raw = Record<string, unknown>;

// Drupal fields are arrays of { value: "..." }. Pull the first scalar.
function firstVal(raw: Raw, key: string): string | null {
  const v = raw[key];
  if (!Array.isArray(v) || v.length === 0) return null;
  const e = v[0];
  const s = e && typeof e === "object" ? (e as { value?: unknown }).value : e;
  const str = s == null ? "" : String(s).trim();
  return str === "" ? null : str;
}

function sumVals(raws: Raw[], key: string): number | null {
  let total = 0;
  let seen = false;
  for (const raw of raws) {
    const v = firstVal(raw, key);
    if (v == null) continue;
    const n = Number(v.replace(/[, ]/g, ""));
    if (Number.isFinite(n) && n > 0) {
      total += n;
      seen = true;
    }
  }
  return seen ? total : null;
}

function firstAcross(raws: Raw[], key: string): string | null {
  for (const raw of raws) {
    const v = firstVal(raw, key);
    if (v != null) return v;
  }
  return null;
}

// certifications: array of taxonomy objects with a `name`. Union, de-duped.
function certs(raws: Raw[]): string[] {
  const set = new Set<string>();
  for (const raw of raws) {
    for (const k of ["field_certifications_compliance", "field_certifications_sustainabil"]) {
      const v = raw[k];
      if (!Array.isArray(v)) continue;
      for (const e of v) {
        const name = e && typeof e === "object" ? (e as { name?: unknown }).name : e;
        if (typeof name === "string" && name.trim()) set.add(name.trim());
      }
    }
  }
  return [...set];
}

// security infrastructure: array of free-text strings.
function securityFeatures(raws: Raw[]): string[] {
  const set = new Set<string>();
  for (const raw of raws) {
    const v = raw["field_security_infrastructure_"];
    if (!Array.isArray(v)) continue;
    for (const e of v) {
      const s = e && typeof e === "object" ? (e as { value?: unknown }).value : e;
      if (typeof s === "string" && s.trim()) set.add(s.trim());
    }
  }
  return [...set];
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

const TARGET_COLS = [
  "power_mw",
  "space_sqft",
  "space_sqm",
  "pue",
  "cooling_redundancy",
  "ups_redundancy",
  "building_description",
  "certifications",
  "security",
] as const;

type Row = {
  id: string;
  slug: string;
} & Record<(typeof TARGET_COLS)[number], unknown>;

async function main() {
  console.log(`Digital Realty spec backfill — ${APPLY ? "APPLY" : "dry-run"}\n`);

  // 1. DR facilities + current values of target columns.
  const facilities: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select(`id, slug, ${TARGET_COLS.join(", ")}`)
      .eq("operator", OPERATOR)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    facilities.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  console.log(`${facilities.length} ${OPERATOR} facilities`);

  // 2. Their digitalrealty-com source records, grouped by facility.
  const ids = facilities.map((f) => f.id);
  const rawByFac = new Map<string, Raw[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("source_records")
      .select("data_center_id, raw")
      .eq("source", SOURCE)
      .in("data_center_id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) {
      const list = rawByFac.get(r.data_center_id) ?? [];
      list.push(r.raw as Raw);
      rawByFac.set(r.data_center_id, list);
    }
  }
  console.log(`${rawByFac.size} facilities have a ${SOURCE} payload\n`);

  // 3. Build fill-only-NULL updates.
  const fillCount: Record<string, number> = Object.fromEntries(TARGET_COLS.map((c) => [c, 0]));
  const updates: Array<{ id: string; slug: string; patch: Record<string, unknown> }> = [];
  const samples: string[] = [];

  for (const f of facilities) {
    const raws = rawByFac.get(f.id);
    if (!raws?.length) continue;

    const candidate: Record<string, unknown> = {};

    const powerKw = sumVals(raws, "field_utility_power_capacity");
    if (powerKw != null) {
      const mw = Math.round((powerKw / 1000) * 100) / 100; // kW → MW
      if (mw > 0 && mw < 2000) candidate.power_mw = mw;
    }
    const sqft = sumVals(raws, "field_total_building_size_in_ft2");
    if (sqft != null && sqft < 20_000_000) candidate.space_sqft = Math.round(sqft);
    const sqm = sumVals(raws, "field_total_building_size_in_m2");
    if (sqm != null && sqm < 2_000_000) candidate.space_sqm = Math.round(sqm);

    const pueStr = firstAcross(raws, "field_design_pue");
    if (pueStr != null) {
      const pue = Number(pueStr);
      if (Number.isFinite(pue) && pue >= 1.0 && pue <= 3.5) candidate.pue = pue;
    }

    const cooling = firstAcross(raws, "field_cooling_plant_redundancy");
    if (cooling) candidate.cooling_redundancy = cooling;
    const ups = firstAcross(raws, "field_ups_redundancy");
    if (ups) candidate.ups_redundancy = ups;
    const building = firstAcross(raws, "field_building_structure");
    if (building) candidate.building_description = building;

    const c = certs(raws);
    if (c.length) candidate.certifications = c;
    const sec = securityFeatures(raws);
    if (sec.length) candidate.security = { features: sec };

    // Keep only columns that are currently empty on the facility row.
    const patch: Record<string, unknown> = {};
    for (const col of TARGET_COLS) {
      if (col in candidate && isEmpty(f[col])) {
        patch[col] = candidate[col];
        fillCount[col]++;
      }
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ id: f.id, slug: f.slug, patch });
      if (samples.length < 6) {
        const bits = Object.entries(patch).map(
          ([k, v]) => `${k}=${Array.isArray(v) ? `[${v.length}]` : typeof v === "object" ? "{…}" : v}`,
        );
        samples.push(`  ${f.slug}\n    ${bits.join(" · ")}`);
      }
    }
  }

  console.log("Would fill (NULL cells only):");
  for (const col of TARGET_COLS) console.log(`  ${col.padEnd(22)} ${fillCount[col]}`);
  console.log(`\n${updates.length} facilities get at least one new field.\n`);
  console.log("Samples:");
  console.log(samples.join("\n"));

  if (!APPLY) {
    console.log("\nRe-run with `--apply` to commit.");
    return;
  }

  console.log(`\nApplying ${updates.length} updates...`);
  let done = 0;
  for (const u of updates) {
    const { error } = await sb.from("data_centers").update(u.patch).eq("id", u.id);
    if (error) throw new Error(`update ${u.slug}: ${error.message}`);
    done++;
    if (done % 25 === 0) process.stdout.write(`  ${done}/${updates.length}\r`);
  }
  console.log(`  ${done}/${updates.length} committed`);

  await refreshSummaryViews();
  await triggerRebuild("backfill-digitalrealty-specs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
