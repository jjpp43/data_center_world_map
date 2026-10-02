import { unstable_cache } from "next/cache";
import { catalogIndexCache, pageCache } from "./cache-tags";
import { supabaseServer } from "./supabase";
import { CITY_MIN_FACILITIES } from "./indexable";
import {
  normalizeUsState,
  usCitySlug,
  usStateName,
  usStateSlug,
} from "./us-states";

export type UsFacilityRow = {
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  city: string | null;
  region: string | null;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
};

export type UsStateIndexEntry = {
  code: string;
  slug: string;
  name: string;
  facility_count: number;
};

export type UsCityIndexEntry = {
  state_code: string;
  state_slug: string;
  city_slug: string;
  city_name: string;
  facility_count: number;
};

export type UsLocationIndex = {
  states: UsStateIndexEntry[];
  cities: UsCityIndexEntry[];
};

export type UsCityGroup = {
  slug: string;
  name: string;
  facilities: UsFacilityRow[];
};

async function fetchUsFacilities(): Promise<UsFacilityRow[]> {
  const sb = supabaseServer();
  const facilities: UsFacilityRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("slug, name, operator, code, city, region, status, power_mw, space_sqft")
      .eq("country", "US")
      .neq("status", "decommissioned")
      .order("city")
      .order("operator")
      .order("name")
      .range(from, from + 999)
      .returns<UsFacilityRow[]>();
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

function buildLocationIndex(rows: UsFacilityRow[]): UsLocationIndex {
  const stateCounts = new Map<string, number>();
  const cityBuckets = new Map<string, { state: string; slug: string; names: string[]; count: number }>();

  for (const row of rows) {
    const state = normalizeUsState(row.region);
    if (!state) continue;
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    if (!row.city) continue;
    const slug = usCitySlug(row.city);
    if (!slug) continue;
    const key = `${state}:${slug}`;
    const bucket = cityBuckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.names.push(row.city);
    } else {
      cityBuckets.set(key, { state, slug, names: [row.city], count: 1 });
    }
  }

  const states: UsStateIndexEntry[] = [...stateCounts.entries()]
    .map(([code, facility_count]) => ({
      code,
      slug: usStateSlug(code),
      name: usStateName(code),
      facility_count,
    }))
    .sort((a, b) => b.facility_count - a.facility_count);

  const cities: UsCityIndexEntry[] = [...cityBuckets.values()]
    .filter((b) => b.count >= CITY_MIN_FACILITIES)
    .map((b) => ({
      state_code: b.state,
      state_slug: usStateSlug(b.state),
      city_slug: b.slug,
      city_name: mostFrequentLabel(b.names),
      facility_count: b.count,
    }))
    .sort((a, b) => b.facility_count - a.facility_count);

  return { states, cities };
}

/** Untagged 30d. Safe for state/city/facility detail pages. */
export const loadUsFacilities = unstable_cache(
  fetchUsFacilities,
  ["us-facilities-v1"],
  pageCache,
);

/**
 * Index/sitemap/`generateStaticParams` only. Must not be called from
 * `/countries/united-states/[state]`, city pages, or `/facility/[slug]`.
 */
export const loadUsLocationIndex = unstable_cache(
  async () => buildLocationIndex(await fetchUsFacilities()),
  ["us-location-index-v1"],
  catalogIndexCache,
);

/** Untagged compact key list so facility pages can link city hubs without the tagged index. */
export const loadUsCityPageKeys = unstable_cache(
  async () =>
    buildLocationIndex(await fetchUsFacilities()).cities.map(
      (c) => `${c.state_code}:${c.city_slug}`,
    ),
  ["us-city-page-keys-v1"],
  pageCache,
);

export function facilitiesInState(rows: UsFacilityRow[], code: string): UsFacilityRow[] {
  return rows.filter((r) => normalizeUsState(r.region) === code);
}

export function facilitiesInCity(
  rows: UsFacilityRow[],
  stateCode: string,
  citySlug: string,
): UsFacilityRow[] {
  return facilitiesInState(rows, stateCode).filter(
    (r) => r.city != null && usCitySlug(r.city) === citySlug,
  );
}

export function groupFacilitiesByCity(rows: UsFacilityRow[]): UsCityGroup[] {
  const buckets = new Map<string, { names: string[]; facilities: UsFacilityRow[] }>();
  const unknown: UsFacilityRow[] = [];

  for (const row of rows) {
    if (!row.city) {
      unknown.push(row);
      continue;
    }
    const slug = usCitySlug(row.city);
    if (!slug) {
      unknown.push(row);
      continue;
    }
    const bucket = buckets.get(slug);
    if (bucket) {
      bucket.facilities.push(row);
      bucket.names.push(row.city);
    } else {
      buckets.set(slug, { names: [row.city], facilities: [row] });
    }
  }

  const groups: UsCityGroup[] = [...buckets.entries()].map(([slug, b]) => ({
    slug,
    name: mostFrequentLabel(b.names),
    facilities: b.facilities,
  }));
  groups.sort((a, b) => b.facilities.length - a.facilities.length);
  if (unknown.length > 0) {
    groups.push({ slug: "", name: "(Unknown city)", facilities: unknown });
  }
  return groups;
}

export function operatorRanking(
  rows: Array<{ operator: string | null }>,
): Array<{ operator: string; facility_count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.operator) continue;
    counts.set(row.operator, (counts.get(row.operator) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([operator, facility_count]) => ({ operator, facility_count }))
    .sort((a, b) => b.facility_count - a.facility_count);
}

