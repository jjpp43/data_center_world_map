import { supabaseServer } from "./supabase";

function rawSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface IxpSummary {
  ix_id: string;
  uuid: string;
  name: string;
  name_long: string | null;
  slug: string;
  city: string | null;
  country: string | null;
  region_continent: string | null;
  net_count: number | null;
  website: string | null;
  facility_count: number;
}

interface IxRawRow {
  id: string;
  ix_id: string;
  name: string;
  name_long: string | null;
  city: string | null;
  country: string | null;
  region_continent: string | null;
  net_count: number | null;
  website: string | null;
  ixes_at_facility: Array<{ count: number }> | null;
}

/**
 * Pull every IXP with its facility-presence count via the relational join.
 * Slugs are computed in JS so we can fall back to `<slug>-<ix_id>` when two
 * IXPs share the same slugified name (rare but real — e.g. regional shards
 * of the same brand).
 */
export async function loadIxpSummaries(): Promise<IxpSummary[]> {
  const sb = supabaseServer();
  const rows: IxRawRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("ixes")
      .select(
        "id, ix_id, name, name_long, city, country, region_continent, net_count, website, ixes_at_facility(count)",
      )
      .order("net_count", { ascending: false, nullsFirst: false })
      .order("name")
      .range(from, from + 999)
      .returns<IxRawRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const slugCount = new Map<string, number>();
  for (const r of rows) {
    const s = rawSlug(r.name);
    slugCount.set(s, (slugCount.get(s) ?? 0) + 1);
  }

  return rows
    .map((r) => {
      const s = rawSlug(r.name);
      const slug = (slugCount.get(s) ?? 0) > 1 ? `${s}-${r.ix_id}` : s;
      return {
        ix_id: r.ix_id,
        uuid: r.id,
        name: r.name,
        name_long: r.name_long,
        slug,
        city: r.city,
        country: r.country,
        region_continent: r.region_continent,
        net_count: r.net_count,
        website: r.website,
        facility_count: r.ixes_at_facility?.[0]?.count ?? 0,
      };
    })
    .filter((r) => r.slug.length > 0);
}

export interface IxpDetail {
  ixp: IxpSummary;
  facilities: Array<{
    slug: string;
    name: string;
    operator: string | null;
    city: string | null;
    country: string;
    power_mw: number | null;
    network_count: number;
  }>;
  operator_ranking: Array<{ operator: string; facility_count: number }>;
  country_breakdown: Array<{ country: string; facility_count: number }>;
}

interface FacilityJoinRow {
  data_centers: {
    slug: string;
    name: string;
    operator: string | null;
    city: string | null;
    country: string;
    power_mw: number | null;
    networks_at_facility: Array<{ count: number }> | null;
  } | null;
}

export async function loadIxpDetail(slug: string): Promise<IxpDetail | null> {
  const all = await loadIxpSummaries();
  const ixp = all.find((r) => r.slug === slug);
  if (!ixp) return null;

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("ixes_at_facility")
    .select(
      "data_centers!inner(slug, name, operator, city, country, power_mw, networks_at_facility(count))",
    )
    .eq("ix_id", ixp.uuid)
    .returns<FacilityJoinRow[]>();
  if (error) throw error;

  const facilities = (data ?? [])
    .map((r) => r.data_centers)
    .filter((f): f is NonNullable<FacilityJoinRow["data_centers"]> => !!f)
    .map((f) => ({
      slug: f.slug,
      name: f.name,
      operator: f.operator,
      city: f.city,
      country: f.country,
      power_mw: f.power_mw,
      network_count: f.networks_at_facility?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.network_count - a.network_count);

  const byOperator = new Map<string, number>();
  const byCountry = new Map<string, number>();
  for (const f of facilities) {
    if (f.operator) byOperator.set(f.operator, (byOperator.get(f.operator) ?? 0) + 1);
    byCountry.set(f.country, (byCountry.get(f.country) ?? 0) + 1);
  }

  return {
    ixp,
    facilities,
    operator_ranking: [...byOperator.entries()]
      .map(([operator, facility_count]) => ({ operator, facility_count }))
      .sort((a, b) => b.facility_count - a.facility_count),
    country_breakdown: [...byCountry.entries()]
      .map(([country, facility_count]) => ({ country, facility_count }))
      .sort((a, b) => b.facility_count - a.facility_count),
  };
}
