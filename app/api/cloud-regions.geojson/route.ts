import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("cloud_regions")
    .select("provider, code, name, city, country, lat, lng, az_count, launched_year");

  if (error) {
    return NextResponse.json(
      { type: "FeatureCollection", features: [], error: error.message },
      { status: 500 },
    );
  }

  const features = (data ?? []).map((r) => ({
    type: "Feature" as const,
    id: `${r.provider}-${r.code}`,
    geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
    properties: {
      provider: r.provider,
      code: r.code,
      name: r.name,
      city: r.city ?? "",
      country: r.country,
      az_count: r.az_count,
      launched_year: r.launched_year,
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
