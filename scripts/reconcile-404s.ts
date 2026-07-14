/**
 * Reconcile Google Search Console "Not found (404)" URLs against the live
 * facility catalog and generate routing-layer redirects for the ones that
 * merely moved slug.
 *
 * Facility slugs historically embedded the (volatile) city token, so a
 * re-scrape that changed or dropped a city re-slugged the page and stranded
 * the already-indexed URL as a 404. This script:
 *
 *   1. Reads the GSC export CSV (Search Console → Page indexing → "Not found
 *      (404)" → Export). Any column/cell containing a /facility/<slug> URL is
 *      picked up, so the raw "Table.csv" or a copy-pasted list both work.
 *   2. Loads every live facility slug from Supabase (anon key, public read).
 *   3. For each stranded slug, finds the live slug that shares the longest
 *      dash-segment prefix (operator + code region) — the re-slugged twin.
 *   4. RESOLVED strandings are merged into data/facility-slug-redirects.json,
 *      which next.config.ts turns into permanent 308s. UNRESOLVED ones (no
 *      confident live twin — genuinely deleted facilities) are only reported;
 *      a 404 is the correct response for those.
 *
 * Heuristic + human-reviewable by design: it prints every mapping and only
 * writes with --apply. Re-run after ingests that change slugs.
 *
 *   npm run reconcile:404 -- --csv ~/Downloads/Table.csv           # dry-run
 *   npm run reconcile:404 -- --csv ~/Downloads/Table.csv --apply   # write JSON
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const PAGE = 1000;
const REDIRECTS_PATH = path.join(process.cwd(), "data/facility-slug-redirects.json");
const SLUG_RE = /\/facility\/([a-z0-9-]{1,100})/gi;
// Require the shared prefix to cover at least this many dash segments
// (operator token + code token) before we trust a match. Below this the two
// slugs merely share an operator and are almost certainly different sites.
const MIN_SHARED_SEGMENTS = 2;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  }
  return createClient(url, anon, { auth: { persistSession: false } });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadLiveSlugs(): Promise<Set<string>> {
  const sb = client();
  const slugs = new Set<string>();
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await sb
      .from("data_centers")
      .select("slug")
      .order("slug")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) slugs.add(r.slug as string);
    if (data.length < PAGE) break;
  }
  return slugs;
}

function extractStrandedSlugs(csv: string, live: Set<string>): string[] {
  const found = new Set<string>();
  for (const m of csv.matchAll(SLUG_RE)) found.add(m[1].toLowerCase());
  // Only slugs that are actually dead now count as strandings.
  return [...found].filter((s) => !live.has(s));
}

// Longest common prefix measured in whole dash segments.
function sharedSegments(a: string, b: string): number {
  const as = a.split("-");
  const bs = b.split("-");
  let n = 0;
  while (n < as.length && n < bs.length && as[n] === bs[n]) n++;
  return n;
}

function bestLiveTwin(stranded: string, live: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const cand of live) {
    // Cheap gate: must share the first segment (operator token).
    if (cand[0] !== stranded[0]) continue;
    const score = sharedSegments(stranded, cand);
    if (score < MIN_SHARED_SEGMENTS) continue;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  // Ambiguous winner → refuse to guess (a wrong 308 is worse than a 404).
  return tie ? null : best;
}

async function main() {
  const csvPath = arg("--csv");
  const apply = process.argv.includes("--apply");
  if (!csvPath) {
    console.error(
      "Usage: npm run reconcile:404 -- --csv <GSC export csv> [--apply]",
    );
    process.exit(1);
  }

  const csv = await fs.readFile(csvPath, "utf8");
  const live = await loadLiveSlugs();
  console.log(`Live facility slugs: ${live.size}`);

  const stranded = extractStrandedSlugs(csv, live);
  console.log(`Stranded facility 404s in export: ${stranded.length}\n`);

  const liveArr = [...live];
  const resolved: Record<string, string> = {};
  const unresolved: string[] = [];

  for (const s of stranded) {
    const twin = bestLiveTwin(s, liveArr);
    if (twin) {
      resolved[s] = twin;
      console.log(`  ✓ ${s}  →  ${twin}`);
    } else {
      unresolved.push(s);
    }
  }

  console.log(
    `\nResolved (redirect): ${Object.keys(resolved).length}` +
      `   Unresolved (likely deleted — 404 is correct): ${unresolved.length}`,
  );
  if (unresolved.length) {
    console.log("\nUnresolved:");
    for (const s of unresolved) console.log(`  ✗ ${s}`);
  }

  if (!apply) {
    console.log("\nDry-run. Re-run with --apply to merge into data/facility-slug-redirects.json.");
    return;
  }

  const existing: Record<string, string> = JSON.parse(
    await fs.readFile(REDIRECTS_PATH, "utf8").catch(() => "{}"),
  );
  const merged = { ...existing, ...resolved };
  // Deterministic key order keeps diffs reviewable.
  const sorted = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
  );
  await fs.writeFile(REDIRECTS_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(
    `\nWrote ${Object.keys(sorted).length} redirects (${Object.keys(resolved).length} new/updated) to data/facility-slug-redirects.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
