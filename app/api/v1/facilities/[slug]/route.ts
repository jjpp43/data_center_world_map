import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { errorResponse, jsonResponse, preflight } from "@/lib/api";

export const runtime = "nodejs";

const DETAIL_COLUMNS =
  "id, slug, name, operator, code, address, city, region, country, postal_code, " +
  "lat, lng, status, " +
  "power_mw, power_redundancy, power_distribution, space_sqft, space_sqm, " +
  "raised_floor_sqft, site_acres, building_description, " +
  "min_cabinet_density_kw, max_cabinet_density_kw, " +
  "tier, uptime_sla, ups_redundancy, generator_redundancy, generator_autonomy, " +
  "cooling, cooling_redundancy, year_built, year_opened, pue, meet_me_rooms, " +
  "carriers, ixps, certifications, security, website, datasheet_url, verified, " +
  "created_at, updated_at";

type Detail = {
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

export function OPTIONS() {
  return preflight();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sb = supabaseServer();

  const { data: dc, error } = await sb
    .from("data_centers")
    .select(DETAIL_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<Detail>();

  if (error) return errorResponse(`query failed: ${error.message}`, 500);
  if (!dc) return errorResponse(`facility not found: ${slug}`, 404);

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

  return jsonResponse(
    {
      data: {
        ...dc,
        sources: sources ?? [],
        networks,
        ixes,
        network_count: networks.length,
        ix_count: ixes.length,
      },
    },
    { cache: "detail" },
  );
}
