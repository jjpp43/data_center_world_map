import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

const PAGE = 1000;

type Row = {
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  city: string | null;
  country: string;
  lat: number;
  lng: number;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
  min_cabinet_density_kw: number | null;
  max_cabinet_density_kw: number | null;
  tier: string | null;
  ups_redundancy: string | null;
  uptime_sla: string | null;
  pue: number | null;
  year_built: number | null;
  networks_at_facility: Array<{ count: number }> | null;
  ixes_at_facility: Array<{ count: number }> | null;
};

export async function GET() {
  const sb = supabaseServer();
  const rows: Row[] = [];

  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await sb
      .from("data_centers")
      .select(
        "slug, name, operator, code, city, country, lat, lng, status, power_mw, space_sqft, min_cabinet_density_kw, max_cabinet_density_kw, tier, ups_redundancy, uptime_sla, pue, year_built, networks_at_facility(count), ixes_at_facility(count)",
      )
      .neq("status", "decommissioned")
      .order("slug")
      .range(from, from + PAGE - 1)
      .returns<Row[]>();
    if (error) {
      return NextResponse.json(
        { type: "FeatureCollection", features: [], error: error.message },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const features = rows.map((d) => ({
    type: "Feature" as const,
    id: d.slug,
    geometry: { type: "Point" as const, coordinates: [d.lng, d.lat] },
    properties: {
      slug: d.slug,
      name: d.name,
      operator: d.operator ?? "Unknown",
      code: d.code,
      city: d.city ?? "",
      country: d.country,
      status: d.status,
      power_mw: d.power_mw,
      space_sqft: d.space_sqft,
      min_cabinet_density_kw: d.min_cabinet_density_kw,
      max_cabinet_density_kw: d.max_cabinet_density_kw,
      tier: d.tier,
      ups_redundancy: d.ups_redundancy,
      uptime_sla: d.uptime_sla,
      pue: d.pue,
      year_built: d.year_built,
      network_count: d.networks_at_facility?.[0]?.count ?? 0,
      ix_count: d.ixes_at_facility?.[0]?.count ?? 0,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
