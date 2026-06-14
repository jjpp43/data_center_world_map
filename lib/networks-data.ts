import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

export interface NetworkSummary {
  asn: number;
  net_id: string;
  uuid: string;
  name: string;
  aka: string | null;
  name_long: string | null;
  website: string | null;
  info_type: string | null;
  info_scope: string | null;
  info_traffic: string | null;
  info_ratio: string | null;
  info_ipv6: boolean | null;
  policy_general: string | null;
  facility_count: number;
}

interface NetRawRow {
  id: string;
  net_id: string;
  asn: number;
  name: string;
  aka: string | null;
  name_long: string | null;
  website: string | null;
  info_type: string | null;
  info_scope: string | null;
  info_traffic: string | null;
  info_ratio: string | null;
  info_ipv6: boolean | null;
  policy_general: string | null;
  networks_at_facility: Array<{ count: number }> | null;
}

/**
 * Pull every PeeringDB network with its facility-presence count. Sorted by
 * facility_count desc so the index page can slice the top N without resorting.
 * The full 34k network space includes a long tail of single- or zero-facility
 * networks; sitemap/index filter on >= the threshold callers pass in.
 */
async function fetchNetworkSummaries(): Promise<NetworkSummary[]> {
  const sb = supabaseServer();
  const rows: NetRawRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("networks")
      .select(
        "id, net_id, asn, name, aka, name_long, website, info_type, info_scope, info_traffic, info_ratio, info_ipv6, policy_general, networks_at_facility(count)",
      )
      .order("asn")
      .range(from, from + 999)
      .returns<NetRawRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  return rows
    .map((r) => ({
      asn: r.asn,
      net_id: r.net_id,
      uuid: r.id,
      name: r.name,
      aka: r.aka,
      name_long: r.name_long,
      website: r.website,
      info_type: r.info_type,
      info_scope: r.info_scope,
      info_traffic: r.info_traffic,
      info_ratio: r.info_ratio,
      info_ipv6: r.info_ipv6,
      policy_general: r.policy_general,
      facility_count: r.networks_at_facility?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.facility_count - a.facility_count || a.asn - b.asn);
}

export const loadNetworkSummaries = unstable_cache(
  fetchNetworkSummaries,
  ["network-summaries-v1"],
  { revalidate: 86_400, tags: ["networks"] },
);

export interface NetworkDetail {
  network: NetworkSummary;
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

export async function loadNetworkDetail(asn: number): Promise<NetworkDetail | null> {
  const sb = supabaseServer();
  const { data: netRows, error: netErr } = await sb
    .from("networks")
    .select(
      "id, net_id, asn, name, aka, name_long, website, info_type, info_scope, info_traffic, info_ratio, info_ipv6, policy_general, networks_at_facility(count)",
    )
    .eq("asn", asn)
    .order("name")
    .returns<NetRawRow[]>();
  if (netErr) throw netErr;
  if (!netRows || netRows.length === 0) return null;

  // PeeringDB occasionally has multiple registrations for one ASN; take the
  // record with the broadest facility footprint as the canonical surface.
  const r = [...netRows].sort(
    (a, b) =>
      (b.networks_at_facility?.[0]?.count ?? 0) - (a.networks_at_facility?.[0]?.count ?? 0),
  )[0];

  const network: NetworkSummary = {
    asn: r.asn,
    net_id: r.net_id,
    uuid: r.id,
    name: r.name,
    aka: r.aka,
    name_long: r.name_long,
    website: r.website,
    info_type: r.info_type,
    info_scope: r.info_scope,
    info_traffic: r.info_traffic,
    info_ratio: r.info_ratio,
    info_ipv6: r.info_ipv6,
    policy_general: r.policy_general,
    facility_count: r.networks_at_facility?.[0]?.count ?? 0,
  };

  const { data: joins, error: joinErr } = await sb
    .from("networks_at_facility")
    .select(
      "data_centers!inner(slug, name, operator, city, country, power_mw, networks_at_facility(count))",
    )
    .eq("network_id", network.uuid)
    .returns<FacilityJoinRow[]>();
  if (joinErr) throw joinErr;

  const facilities = (joins ?? [])
    .map((j) => j.data_centers)
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
    network,
    facilities,
    operator_ranking: [...byOperator.entries()]
      .map(([operator, facility_count]) => ({ operator, facility_count }))
      .sort((a, b) => b.facility_count - a.facility_count),
    country_breakdown: [...byCountry.entries()]
      .map(([country, facility_count]) => ({ country, facility_count }))
      .sort((a, b) => b.facility_count - a.facility_count),
  };
}
