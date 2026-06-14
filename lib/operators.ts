import { unstable_cache } from "next/cache";
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

interface OperatorAggRow {
  operator: string;
  country: string;
  power_mw: number | null;
}

/**
 * Aggregate every operator with at least one non-decommissioned facility.
 * Counts come from a fan-out scan rather than a per-operator SQL group-by so
 * we don't depend on Postgres views — the table is small enough (5k rows).
 */
async function fetchOperatorSummaries(): Promise<OperatorSummary[]> {
  const sb = supabaseServer();
  const rows: OperatorAggRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("operator, country, power_mw")
      .neq("status", "decommissioned")
      .not("operator", "is", null)
      .order("operator")
      .range(from, from + 999)
      .returns<OperatorAggRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const byName = new Map<string, { countries: Set<string>; count: number; mw: number | null }>();
  for (const r of rows) {
    if (!r.operator) continue;
    const cur = byName.get(r.operator) ?? { countries: new Set<string>(), count: 0, mw: null };
    cur.count += 1;
    if (r.country) cur.countries.add(r.country);
    if (r.power_mw != null) cur.mw = (cur.mw ?? 0) + r.power_mw;
    byName.set(r.operator, cur);
  }

  return [...byName.entries()]
    .map(([name, v]) => ({
      name,
      slug: operatorSlug(name),
      facility_count: v.count,
      countries: v.countries.size,
      total_power_mw: v.mw,
    }))
    .filter((o) => o.slug.length > 0)
    .sort((a, b) => b.facility_count - a.facility_count);
}

export const loadOperatorSummaries = unstable_cache(
  fetchOperatorSummaries,
  ["operator-summaries-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

/**
 * Resolve a URL slug back to the canonical operator name. Returns null if no
 * operator slugifies to the given value. Multiple operators can collide on
 * the same slug (e.g. "Equinix" vs "Equinix Inc"); we pick the one with the
 * most facilities, which is the practically-intended match.
 */
export async function findOperatorBySlug(slug: string): Promise<OperatorSummary | null> {
  const all = await loadOperatorSummaries();
  const matches = all.filter((o) => o.slug === slug);
  if (matches.length === 0) return null;
  return matches[0] ?? null;
}
