/**
 * Build-time bake of the homepage map data.
 *
 * Reads data_centers + cloud_regions from Supabase once and writes
 *   public/facilities.geojson
 *   public/cloud-regions.geojson
 *
 * The Vercel CDN serves these static files directly — the runtime function
 * never touches Supabase for map data, which is by far the largest single
 * contributor to Supabase egress. Refresh is triggered by the daily Vercel
 * cron (app/api/cron/refresh-geojson) and by ingest scripts after --apply.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const PAGE = 1000;

type FacilityRow = {
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

type CloudRegionRow = {
  provider: string;
  code: string;
  name: string;
  city: string | null;
  country: string;
  lat: number;
  lng: number;
  az_count: number | null;
  launched_year: number | null;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  }
  return createClient(url, anon, { auth: { persistSession: false } });
}

async function buildFacilities() {
  const sb = client();
  const rows: FacilityRow[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await sb
      .from("data_centers")
      .select(
        "slug, name, operator, code, city, country, lat, lng, status, power_mw, space_sqft, min_cabinet_density_kw, max_cabinet_density_kw, tier, ups_redundancy, uptime_sla, pue, year_built, networks_at_facility(count), ixes_at_facility(count)",
      )
      .neq("status", "decommissioned")
      .order("slug")
      .range(from, from + PAGE - 1)
      .returns<FacilityRow[]>();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const features = rows.map((d) => {
    const props: Record<string, unknown> = {
      slug: d.slug,
      name: d.name,
      operator: d.operator ?? "Unknown",
      country: d.country,
      status: d.status,
    };
    if (d.code) props.code = d.code;
    if (d.city) props.city = d.city;
    if (d.power_mw != null) props.power_mw = d.power_mw;
    if (d.space_sqft != null) props.space_sqft = d.space_sqft;
    if (d.min_cabinet_density_kw != null) props.min_cabinet_density_kw = d.min_cabinet_density_kw;
    if (d.max_cabinet_density_kw != null) props.max_cabinet_density_kw = d.max_cabinet_density_kw;
    if (d.tier) props.tier = d.tier;
    if (d.ups_redundancy) props.ups_redundancy = d.ups_redundancy;
    if (d.uptime_sla) props.uptime_sla = d.uptime_sla;
    if (d.pue != null) props.pue = d.pue;
    if (d.year_built != null) props.year_built = d.year_built;
    const nc = d.networks_at_facility?.[0]?.count ?? 0;
    const ic = d.ixes_at_facility?.[0]?.count ?? 0;
    if (nc > 0) props.network_count = nc;
    if (ic > 0) props.ix_count = ic;
    return {
      type: "Feature",
      id: d.slug,
      geometry: { type: "Point", coordinates: [d.lng, d.lat] },
      properties: props,
    };
  });

  return { type: "FeatureCollection", features };
}

async function buildCloudRegions() {
  const sb = client();
  const { data, error } = await sb
    .from("cloud_regions")
    .select("provider, code, name, city, country, lat, lng, az_count, launched_year")
    .returns<CloudRegionRow[]>();
  if (error) throw new Error(error.message);

  const features = (data ?? []).map((r) => {
    const props: Record<string, unknown> = {
      provider: r.provider,
      code: r.code,
      name: r.name,
      country: r.country,
    };
    if (r.city) props.city = r.city;
    if (r.az_count != null) props.az_count = r.az_count;
    if (r.launched_year != null) props.launched_year = r.launched_year;
    return {
      type: "Feature",
      id: `${r.provider}-${r.code}`,
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: props,
    };
  });

  return { type: "FeatureCollection", features };
}

async function main() {
  const publicDir = path.join(process.cwd(), "public");
  await fs.mkdir(publicDir, { recursive: true });

  console.log("Building facilities.geojson…");
  const facilities = await buildFacilities();
  const facilitiesPath = path.join(publicDir, "facilities.geojson");
  await fs.writeFile(facilitiesPath, JSON.stringify(facilities));
  console.log(`  ${facilities.features.length} features → ${facilitiesPath}`);

  console.log("Building cloud-regions.geojson…");
  const cloudRegions = await buildCloudRegions();
  const cloudRegionsPath = path.join(publicDir, "cloud-regions.geojson");
  await fs.writeFile(cloudRegionsPath, JSON.stringify(cloudRegions));
  console.log(`  ${cloudRegions.features.length} features → ${cloudRegionsPath}`);
}

main().catch((e) => {
  console.error("build-geojson failed:", e);
  process.exit(1);
});
