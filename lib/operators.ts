import { unstable_cache } from "next/cache";
import { cache } from "react";
import { catalogIndexCache, pageCache } from "./cache-tags";
import { supabaseServer } from "./supabase";

/**
 * Deterministic operator-name → URL slug. Lowercase, strip punctuation,
 * collapse non-alphanumerics to hyphens, trim. Stable across runs so the
 * sitemap stays consistent.
 */
export function operatorSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface OperatorSummary {
  name: string;
  slug: string;
  facility_count: number;
  countries: number;
  total_power_mw: number | null;
}

interface OperatorSummaryRow {
  name: string;
  facility_count: number;
  country_count: number;
  total_power_mw: number | null;
}

async function fetchOperatorSummaries(): Promise<OperatorSummary[]> {
  const sb = supabaseServer();
  const rows: OperatorSummaryRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("operator_summary")
      .select("name, facility_count, country_count, total_power_mw")
      .order("name")
      .range(from, from + 999)
      .returns<OperatorSummaryRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows
    .map((r) => ({
      name: r.name,
      slug: operatorSlug(r.name),
      facility_count: r.facility_count,
      countries: r.country_count,
      total_power_mw: r.total_power_mw,
    }))
    .filter((o) => o.slug.length > 0)
    .sort((a, b) => b.facility_count - a.facility_count);
}

export const loadOperatorSummaries = unstable_cache(
  fetchOperatorSummaries,
  ["operator-summaries-v2"],
  pageCache,
);

/** Index/sitemap only. Must not be called from per-slug operator pages. */
export const loadOperatorIndex = unstable_cache(
  fetchOperatorSummaries,
  ["operator-summaries-index-v1"],
  catalogIndexCache,
);

/**
 * Resolve a URL slug back to the canonical operator name. Returns null if no
 * operator slugifies to the given value. Multiple operators can collide on
 * the same slug (e.g. "Equinix" vs "Equinix Inc"); we pick the one with the
 * most facilities, which is the practically-intended match.
 */
export const findOperatorBySlug = cache(async (slug: string): Promise<OperatorSummary | null> => {
  const all = await loadOperatorSummaries();
  const matches = all.filter((o) => o.slug === slug);
  if (matches.length > 0) return matches[0] ?? null;

  // A new operator may be linked from a freshly ingested facility while the
  // untagged 30-day per-page cache still holds the previous operator set.
  // Check the live summary view before emitting a CDN-cached 404.
  const fresh = await fetchOperatorSummaries();
  return fresh.find((o) => o.slug === slug) ?? null;
});
