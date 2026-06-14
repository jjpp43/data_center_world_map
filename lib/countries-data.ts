import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

export interface CountrySummary {
  code: string;
  facility_count: number;
  operators: number;
  total_power_mw: number | null;
}

interface CountryAggRow {
  country: string;
  operator: string | null;
  power_mw: number | null;
}

async function fetchCountrySummaries(): Promise<CountrySummary[]> {
  const sb = supabaseServer();
  const rows: CountryAggRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("country, operator, power_mw")
      .neq("status", "decommissioned")
      .order("country")
      .range(from, from + 999)
      .returns<CountryAggRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const byCountry = new Map<string, { operators: Set<string>; count: number; mw: number | null }>();
  for (const r of rows) {
    if (!r.country) continue;
    const cur = byCountry.get(r.country) ?? { operators: new Set<string>(), count: 0, mw: null };
    cur.count += 1;
    if (r.operator) cur.operators.add(r.operator);
    if (r.power_mw != null) cur.mw = (cur.mw ?? 0) + r.power_mw;
    byCountry.set(r.country, cur);
  }

  return [...byCountry.entries()]
    .map(([code, v]) => ({
      code,
      facility_count: v.count,
      operators: v.operators.size,
      total_power_mw: v.mw,
    }))
    .sort((a, b) => b.facility_count - a.facility_count);
}

export const loadCountrySummaries = unstable_cache(
  fetchCountrySummaries,
  ["country-summaries-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export async function findCountryByCode(code: string): Promise<CountrySummary | null> {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  const all = await loadCountrySummaries();
  return all.find((c) => c.code === upper) ?? null;
}
