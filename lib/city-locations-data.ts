import { unstable_cache } from "next/cache";
import { catalogIndexCache, pageCache } from "./cache-tags";
import { supabaseServer } from "./supabase";
import { countrySlug } from "./countries";
import { CITY_MIN_FACILITIES } from "./indexable";
import { usCitySlug } from "./us-states";

export type CountryFacilityRow = {
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  city: string | null;
  region: string | null;
  country: string;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
};

export type WorldCityIndexEntry = {
  country_code: string;
  country_slug: string;
  city_slug: string;
  city_name: string;
  facility_count: number;
};

async function fetchFacilitiesForCountry(countryCode: string): Promise<CountryFacilityRow[]> {
  const sb = supabaseServer();
  const facilities: CountryFacilityRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("slug, name, operator, code, city, region, country, status, power_mw, space_sqft")
      .eq("country", countryCode)
      .neq("status", "decommissioned")
      .order("city")
      .order("operator")
      .order("name")
      .range(from, from + 999)
      .returns<CountryFacilityRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    facilities.push(...data);
    if (data.length < 1000) break;
  }
  return facilities;
}

function mostFrequentLabel(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]![0];
}

async function fetchWorldCityIndex(): Promise<WorldCityIndexEntry[]> {
  const sb = supabaseServer();
  const rows: { country: string; city: string | null }[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("country, city")
      .neq("country", "US")
      .neq("status", "decommissioned")
      .order("country")
      .order("city")
      .range(from, from + 999)
      .returns<{ country: string; city: string | null }[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const buckets = new Map<string, { country: string; slug: string; names: string[]; count: number }>();
  for (const row of rows) {
    if (!row.city) continue;
    const slug = usCitySlug(row.city);
    if (!slug) continue;
    const key = `${row.country}:${slug}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.names.push(row.city);
    } else {
      buckets.set(key, { country: row.country, slug, names: [row.city], count: 1 });
    }
  }

  return [...buckets.values()]
    .filter((b) => b.count >= CITY_MIN_FACILITIES)
    .map((b) => ({
      country_code: b.country,
      country_slug: countrySlug(b.country),
      city_slug: b.slug,
      city_name: mostFrequentLabel(b.names),
      facility_count: b.count,
    }))
    .sort((a, b) => b.facility_count - a.facility_count);
}

/** Untagged 30d. Shared by country pages and non-US city hubs. */
export const loadFacilitiesForCountry = unstable_cache(
  fetchFacilitiesForCountry,
  ["country-facilities-v1"],
  pageCache,
);

/**
 * Index/sitemap/`generateStaticParams` only. Must not be called from
 * country, city, or facility detail pages.
 */
export const loadWorldCityIndex = unstable_cache(
  fetchWorldCityIndex,
  ["world-city-index-v1"],
  catalogIndexCache,
);

/** Untagged keys (`DE:frankfurt`) so facility pages can link hubs. */
export const loadWorldCityPageKeys = unstable_cache(
  async () =>
    (await fetchWorldCityIndex()).map((c) => `${c.country_code}:${c.city_slug}`),
  ["world-city-page-keys-v1"],
  pageCache,
);

export function worldCityHref(countryCode: string, citySlug: string): string {
  return `/countries/${countrySlug(countryCode)}/${citySlug}`;
}

export function countryMapHref(countryCode: string): string {
  return `/?country=${countryCode.toUpperCase()}`;
}

export function facilitiesInWorldCity(
  rows: CountryFacilityRow[],
  citySlug: string,
): CountryFacilityRow[] {
  return rows.filter((r) => r.city != null && usCitySlug(r.city) === citySlug);
}

export function cityDisplayName(rows: CountryFacilityRow[], fallbackSlug: string): string {
  const labels = rows.map((r) => r.city).filter((c): c is string => !!c);
  if (labels.length === 0) return fallbackSlug;
  return mostFrequentLabel(labels);
}
