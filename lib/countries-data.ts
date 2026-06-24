import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";
import { countrySlug } from "./countries";

export interface CountrySummary {
  code: string;
  facility_count: number;
  operators: number;
  total_power_mw: number | null;
}

interface CountrySummaryRow {
  code: string;
  facility_count: number;
  operator_count: number;
  total_power_mw: number | null;
}

async function fetchCountrySummaries(): Promise<CountrySummary[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("country_summary")
    .select("code, facility_count, operator_count, total_power_mw")
    .returns<CountrySummaryRow[]>();
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      code: r.code,
      facility_count: r.facility_count,
      operators: r.operator_count,
      total_power_mw: r.total_power_mw,
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

export async function findCountryBySlug(slug: string): Promise<CountrySummary | null> {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  const all = await loadCountrySummaries();
  return all.find((c) => countrySlug(c.code) === slug) ?? null;
}
