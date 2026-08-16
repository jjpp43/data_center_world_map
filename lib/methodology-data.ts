import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

const DIRECTORY = new Set(["peeringdb", "osm"]);
const CLOUD = new Set(["aws", "gcp", "azure", "oracle"]);

export type MethodologyStats = {
  peeringdbFacilities: number;
  osmRecords: number;
  osmOnly: number;
  operatorFacilities: number;
  googleBuildings: number;
  metaBuildings: number;
  cloudRegions: number;
  networks: number;
  ixes: number;
};

async function fetchMethodologyStats(): Promise<MethodologyStats> {
  const sb = supabaseServer();
  const [
    { data: srcRows },
    { count: googleBuildings },
    { count: metaBuildings },
    { count: cloudRegions },
    { count: networks },
    { count: ixes },
  ] = await Promise.all([
    sb.from("source_records").select("data_center_id, source").limit(20000),
    sb.from("data_centers").select("*", { count: "exact", head: true }).eq("operator", "Google"),
    sb.from("data_centers").select("*", { count: "exact", head: true }).eq("operator", "Meta"),
    sb.from("cloud_regions").select("*", { count: "exact", head: true }),
    sb.from("networks").select("*", { count: "exact", head: true }),
    sb.from("ixes").select("*", { count: "exact", head: true }),
  ]);

  const pdb = new Set<string>();
  const osm = new Set<string>();
  const op = new Set<string>();
  let osmRecords = 0;

  for (const r of srcRows ?? []) {
    const id = r.data_center_id as string;
    const source = r.source as string;
    if (source === "peeringdb") pdb.add(id);
    else if (source === "osm") {
      osm.add(id);
      osmRecords++;
    } else if (!DIRECTORY.has(source) && !CLOUD.has(source)) op.add(id);
  }

  let osmOnly = 0;
  for (const id of osm) if (!pdb.has(id)) osmOnly++;

  return {
    peeringdbFacilities: pdb.size,
    osmRecords,
    osmOnly,
    operatorFacilities: op.size,
    googleBuildings: googleBuildings ?? 0,
    metaBuildings: metaBuildings ?? 0,
    cloudRegions: cloudRegions ?? 0,
    networks: networks ?? 0,
    ixes: ixes ?? 0,
  };
}

export const loadMethodologyStats = unstable_cache(
  fetchMethodologyStats,
  ["methodology-stats-v1"],
  { revalidate: 2_592_000, tags: ["data-centers"] },
);
