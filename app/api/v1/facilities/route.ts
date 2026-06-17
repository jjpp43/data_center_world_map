import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import {
  clampInt,
  csv,
  csvResponse,
  errorResponse,
  internalError,
  jsonResponse,
  preflight,
} from "@/lib/api";

export const runtime = "nodejs";

type Row = {
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

const SELECT_COLUMNS =
  "slug, name, operator, code, address, city, region, country, postal_code, lat, lng, status, power_mw, space_sqft, tier, year_built, pue, ups_redundancy, uptime_sla, networks_at_facility(count), ixes_at_facility(count)";

type FacilitiesQuery = {
  countries: string[];
  operators: string[];
  minPowerMw: number | null;
  status: string | null;
  limit: number;
  offset: number;
};

const getFacilitiesPage = unstable_cache(
  async (q: FacilitiesQuery) => {
    const sb = supabaseServer();
    let query = sb
      .from("data_centers")
      .select(SELECT_COLUMNS, { count: "exact" })
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

    const { data, error, count } = await query.returns<Row[]>();
    if (error) throw new Error(`query failed: ${error.message}`);

    const rows = (data ?? []).map((r) => ({
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

export function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = clampInt(sp.get("limit"), 50, 1, 500);
  const offset = clampInt(sp.get("offset"), 0, 0, 1_000_000);
  const countries = csv(sp.get("country")).map((c) => c.toUpperCase());
  const operators = csv(sp.get("operator"));
  const minPowerMwRaw = parseFloat(sp.get("min_power_mw") ?? "");
  const minPowerMw = Number.isFinite(minPowerMwRaw) ? minPowerMwRaw : null;
  const status = sp.get("status");
  const format = (sp.get("format") ?? "json").toLowerCase();

  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be 'json' or 'csv'");
  }

  let rows: Awaited<ReturnType<typeof getFacilitiesPage>>["rows"];
  let total: number;
  try {
    ({ rows, total } = await getFacilitiesPage({
      countries,
      operators,
      minPowerMw,
      status,
      limit,
      offset,
    }));
  } catch (e) {
    return internalError("api/v1/facilities", e);
  }

  if (format === "csv") {
    return csvResponse(rows, { filename: "facilities.csv" });
  }

  const nextOffset = offset + rows.length;
  return jsonResponse({
    data: rows,
    meta: {
      total,
      returned: rows.length,
      limit,
      offset,
      next_offset: nextOffset < total ? nextOffset : null,
    },
  });
}

