import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

export type DensityTier = "ultra-dense" | "dense" | "standard";

export interface TierSpec {
  slug: DensityTier;
  label: string;
  short: string;
  min: number;
  max: number | null;
  blurb: string;
  accent: string;
}

export const TIERS: TierSpec[] = [
  {
    slug: "ultra-dense",
    label: "Ultra-dense",
    short: "50+ networks",
    min: 50,
    max: null,
    blurb:
      "Interconnect hubs. These facilities host 50 or more peering networks — the kind of buildings carrier-neutral colo customers buy specifically to reach everyone in a single cross-connect.",
    accent: "emerald",
  },
  {
    slug: "dense",
    label: "Dense",
    short: "10–49 networks",
    min: 10,
    max: 49,
    blurb:
      "Regional peering points. Strong network presence but not at carrier-hotel scale. The middle of the colo market — useful for regional content and ISP peering.",
    accent: "indigo",
  },
  {
    slug: "standard",
    label: "Standard",
    short: "1–9 networks",
    min: 1,
    max: 9,
    blurb:
      "Facilities with light network presence. Typically wholesale, enterprise-anchored, or hyperscale-leaning buildings where most traffic is internal rather than peered.",
    accent: "zinc",
  },
];

export const TIERS_BY_SLUG: Record<DensityTier, TierSpec> = {
  "ultra-dense": TIERS[0],
  dense: TIERS[1],
  standard: TIERS[2],
};

export function classifyDensity(networkCount: number | null | undefined): DensityTier | null {
  if (networkCount == null || networkCount <= 0) return null;
  if (networkCount >= 50) return "ultra-dense";
  if (networkCount >= 10) return "dense";
  return "standard";
}

interface FacilityRow {
  slug: string;
  name: string;
  operator: string | null;
  city: string | null;
  country: string;
  power_mw: number | null;
  networks_at_facility: Array<{ count: number }> | null;
}

export interface DensityFacility {
  slug: string;
  name: string;
  operator: string | null;
  city: string | null;
  country: string;
  power_mw: number | null;
  network_count: number;
}

const loadAllWithNetworkCount = unstable_cache(
  async (): Promise<DensityFacility[]> => {
    const sb = supabaseServer();
    const rows: DensityFacility[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await sb
        .from("data_centers")
        .select(
          "slug, name, operator, city, country, power_mw, networks_at_facility(count)",
        )
        .neq("status", "decommissioned")
        .order("slug")
        .range(from, from + 999)
        .returns<FacilityRow[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(
        ...data.map((r) => ({
          slug: r.slug,
          name: r.name,
          operator: r.operator,
          city: r.city,
          country: r.country,
          power_mw: r.power_mw,
          network_count: r.networks_at_facility?.[0]?.count ?? 0,
        })),
      );
      if (data.length < 1000) break;
    }
    return rows;
  },
  ["density-facilities-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export interface DensityIndex {
  tiers: Array<TierSpec & { count: number }>;
  total_classified: number;
  total_quiet: number;
}

export async function loadDensityIndex(): Promise<DensityIndex> {
  const all = await loadAllWithNetworkCount();
  const counts: Record<DensityTier, number> = { "ultra-dense": 0, dense: 0, standard: 0 };
  let quiet = 0;
  for (const f of all) {
    const t = classifyDensity(f.network_count);
    if (t) counts[t] += 1;
    else quiet += 1;
  }
  return {
    tiers: TIERS.map((t) => ({ ...t, count: counts[t.slug] })),
    total_classified: counts["ultra-dense"] + counts.dense + counts.standard,
    total_quiet: quiet,
  };
}

export async function loadDensityTier(
  tier: DensityTier,
): Promise<{ spec: TierSpec; facilities: DensityFacility[] } | null> {
  const spec = TIERS_BY_SLUG[tier];
  if (!spec) return null;
  const all = await loadAllWithNetworkCount();
  const facilities = all
    .filter((f) => {
      if (f.network_count < spec.min) return false;
      if (spec.max != null && f.network_count > spec.max) return false;
      return true;
    })
    .sort((a, b) => b.network_count - a.network_count);
  return { spec, facilities };
}
