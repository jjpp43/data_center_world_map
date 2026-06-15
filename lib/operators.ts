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

interface OperatorSummaryRow {
  name: string;
  facility_count: number;
  country_count: number;
  total_power_mw: number | null;
}

async function fetchOperatorSummaries(): Promise<OperatorSummary[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("operator_summary")
    .select("name, facility_count, country_count, total_power_mw")
    .returns<OperatorSummaryRow[]>();
  if (error) throw error;
  return (data ?? [])
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
