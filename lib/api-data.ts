import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { countryName } from "@/lib/countries";

// Single source of truth for /api/v1 + /mcp data access. Both call into
// the same unstable_cache-wrapped loaders so a Supabase query made by
// either surface fills one shared cache entry.
//
// Cache keys are versioned per loader. Bump the trailing -v<n> on a
// response-shape change to force eviction; tags ("data-centers") are
// kept stable so the existing rebuild path still invalidates them.

// ─────────────────────────────────────────────────────────────────────
// Facilities — paginated list
// ─────────────────────────────────────────────────────────────────────

const FACILITY_LIST_COLUMNS =
  "slug, name, operator, code, address, city, region, country, postal_code, lat, lng, status, power_mw, space_sqft, tier, year_built, pue, ups_redundancy, uptime_sla, networks_at_facility(count), ixes_at_facility(count)";

type FacilityListRaw = {
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string;
  postal_code: string | null;
  lat: number;
  lng: number;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
  tier: string | null;
  year_built: number | null;
  pue: number | null;
  ups_redundancy: string | null;
  uptime_sla: string | null;
  networks_at_facility: Array<{ count: number }> | null;
  ixes_at_facility: Array<{ count: number }> | null;
};

export type FacilityListRow = {
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string;
  postal_code: string | null;
  lat: number;
  lng: number;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
  tier: string | null;
  year_built: number | null;
  pue: number | null;
  ups_redundancy: string | null;
  uptime_sla: string | null;
  network_count: number;
  ix_count: number;
};

export type FacilitiesQuery = {
  countries: string[];
  operators: string[];
  minPowerMw: number | null;
  status: string | null;
  limit: number;
  offset: number;
};

export const getFacilitiesPage = unstable_cache(
  async (q: FacilitiesQuery): Promise<{ rows: FacilityListRow[]; total: number }> => {
    const sb = supabaseServer();
    let query = sb
      .from("data_centers")
      .select(FACILITY_LIST_COLUMNS, { count: "exact" })
      .order("slug")
      .range(q.offset, q.offset + q.limit - 1);

    if (q.countries.length > 0) query = query.in("country", q.countries);
    if (q.operators.length > 0) {
      if (q.operators.length === 1) {
        query = query.ilike("operator", `${q.operators[0]}%`);
      } else {
        query = query.in("operator", q.operators);
      }
    }
    if (q.minPowerMw !== null) query = query.gte("power_mw", q.minPowerMw);
    if (q.status) query = query.eq("status", q.status);

    const { data, error, count } = await query.returns<FacilityListRaw[]>();
    if (error) throw new Error(`query failed: ${error.message}`);

    const rows: FacilityListRow[] = (data ?? []).map((r) => ({
      slug: r.slug,
      name: r.name,
      operator: r.operator,
      code: r.code,
      address: r.address,
      city: r.city,
      region: r.region,
      country: r.country,
      postal_code: r.postal_code,
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      power_mw: r.power_mw,
      space_sqft: r.space_sqft,
      tier: r.tier,
      year_built: r.year_built,
      pue: r.pue,
      ups_redundancy: r.ups_redundancy,
      uptime_sla: r.uptime_sla,
      network_count: r.networks_at_facility?.[0]?.count ?? 0,
      ix_count: r.ixes_at_facility?.[0]?.count ?? 0,
    }));

    return { rows, total: count ?? 0 };
  },
  ["api-v1-facilities-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);

// ─────────────────────────────────────────────────────────────────────
// Facility detail (with sources, networks, IXPs)
// ─────────────────────────────────────────────────────────────────────

const FACILITY_DETAIL_COLUMNS =
  "id, slug, name, operator, code, address, city, region, country, postal_code, " +
  "lat, lng, status, " +
  "power_mw, power_redundancy, power_distribution, space_sqft, space_sqm, " +
  "raised_floor_sqft, site_acres, building_description, " +
  "min_cabinet_density_kw, max_cabinet_density_kw, " +
  "tier, uptime_sla, ups_redundancy, generator_redundancy, generator_autonomy, " +
  "cooling, cooling_redundancy, year_built, year_opened, pue, meet_me_rooms, " +
  "carriers, ixps, certifications, security, website, datasheet_url, verified, " +
  "created_at, updated_at";

type FacilityDetailRaw = {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  [key: string]: unknown;
};

type SourceRow = {
  source: string;
  source_id: string;
  source_url: string | null;
  fetched_at: string;
};

type NetworkAtFac = {
  local_asn: number | null;
  networks: {
    net_id: string;
    asn: number;
    name: string;
    website: string | null;
    info_type: string | null;
    info_scope: string | null;
    info_traffic: string | null;
    policy_general: string | null;
  } | null;
};

type IxAtFac = {
  ixes: {
    ix_id: string;
    name: string;
    name_long: string | null;
    country: string | null;
    website: string | null;
    net_count: number | null;
  } | null;
};

export type FacilityDetail = FacilityDetailRaw & {
  sources: SourceRow[];
  networks: NonNullable<NetworkAtFac["networks"]>[];
  ixes: NonNullable<IxAtFac["ixes"]>[];
  network_count: number;
  ix_count: number;
};

export const getFacilityDetail = unstable_cache(
  async (slug: string): Promise<FacilityDetail | null> => {
    const sb = supabaseServer();
    const { data: dc, error } = await sb
      .from("data_centers")
      .select(FACILITY_DETAIL_COLUMNS)
      .eq("slug", slug)
      .maybeSingle<FacilityDetailRaw>();

    if (error) throw new Error(`query failed: ${error.message}`);
    if (!dc) return null;

    const [{ data: sources }, { data: nafRows }, { data: iafRows }] = await Promise.all([
      sb
        .from("source_records")
        .select("source, source_id, source_url, fetched_at")
        .eq("data_center_id", dc.id)
        .order("source")
        .returns<SourceRow[]>(),
      sb
        .from("networks_at_facility")
        .select(
          "local_asn, networks(net_id, asn, name, website, info_type, info_scope, info_traffic, policy_general)",
        )
        .eq("data_center_id", dc.id)
        .limit(2000)
        .returns<NetworkAtFac[]>(),
      sb
        .from("ixes_at_facility")
        .select("ixes(ix_id, name, name_long, country, website, net_count)")
        .eq("data_center_id", dc.id)
        .limit(200)
        .returns<IxAtFac[]>(),
    ]);

    const networks = (nafRows ?? [])
      .map((r) => r.networks)
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const ixes = (iafRows ?? [])
      .map((r) => r.ixes)
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .sort((a, b) => (b.net_count ?? 0) - (a.net_count ?? 0));

    return {
      ...dc,
      sources: sources ?? [],
      networks,
      ixes,
      network_count: networks.length,
      ix_count: ixes.length,
    };
  },
  ["api-v1-facility-detail-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);

// ─────────────────────────────────────────────────────────────────────
// Operators — aggregate by facility/country count
// ─────────────────────────────────────────────────────────────────────

type OperatorRowRaw = { operator: string | null; country: string };
export type OperatorAggregate = {
  operator: string;
  facility_count: number;
  country_count: number;
};

export const getOperatorAggregates = unstable_cache(
  async (countries: string[]): Promise<OperatorAggregate[]> => {
    const sb = supabaseServer();
    const all: OperatorRowRaw[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      let q = sb
        .from("data_centers")
        .select("operator, country")
        .neq("status", "decommissioned")
        .order("slug")
        .range(from, from + 999);
      if (countries.length > 0) q = q.in("country", countries);
      const { data, error } = await q.returns<OperatorRowRaw[]>();
      if (error) throw new Error(`query failed: ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
    }

    const counts = new Map<string, { facility_count: number; countries: Set<string> }>();
    for (const r of all) {
      const op = r.operator ?? "(unknown)";
      let agg = counts.get(op);
      if (!agg) {
        agg = { facility_count: 0, countries: new Set() };
        counts.set(op, agg);
      }
      agg.facility_count++;
      agg.countries.add(r.country);
    }

    return [...counts.entries()]
      .map(([operator, agg]) => ({
        operator,
        facility_count: agg.facility_count,
        country_count: agg.countries.size,
      }))
      .sort((a, b) => b.facility_count - a.facility_count);
  },
  ["api-v1-operators-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);

// ─────────────────────────────────────────────────────────────────────
// Countries — aggregate by facility count
// ─────────────────────────────────────────────────────────────────────

type CountryRowRaw = { country: string };
export type CountryAggregate = {
  country: string;
  country_name: string | null;
  facility_count: number;
};

export const getCountryAggregates = unstable_cache(
  async (): Promise<CountryAggregate[]> => {
    const sb = supabaseServer();
    const all: CountryRowRaw[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await sb
        .from("data_centers")
        .select("country")
        .neq("status", "decommissioned")
        .order("slug")
        .range(from, from + 999)
        .returns<CountryRowRaw[]>();
      if (error) throw new Error(`query failed: ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
    }

    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.country, (counts.get(r.country) ?? 0) + 1);

    return [...counts.entries()]
      .map(([code, n]) => ({
        country: code,
        country_name: countryName(code) ?? null,
        facility_count: n,
      }))
      .sort((a, b) => b.facility_count - a.facility_count);
  },
  ["api-v1-countries-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);

// ─────────────────────────────────────────────────────────────────────
// Cloud regions
// ─────────────────────────────────────────────────────────────────────

export type CloudRegionRow = {
  provider: string;
  code: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  az_count: number | null;
  launched_year: number | null;
  services: string[] | null;
  source_url: string | null;
};

export const getCloudRegions = unstable_cache(
  async (providers: string[], countries: string[]): Promise<CloudRegionRow[]> => {
    const sb = supabaseServer();
    let q = sb
      .from("cloud_regions")
      .select(
        "provider, code, name, city, country, lat, lng, az_count, launched_year, services, source_url",
      )
      .order("provider")
      .order("code");
    if (providers.length > 0) q = q.in("provider", providers);
    if (countries.length > 0) q = q.in("country", countries);

    const { data, error } = await q.returns<CloudRegionRow[]>();
    if (error) throw new Error(`query failed: ${error.message}`);
    return data ?? [];
  },
  ["api-v1-cloud-regions-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);
