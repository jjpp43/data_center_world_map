import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

export interface DenseFacility {
  slug: string;
  name: string;
  operator: string | null;
  city: string | null;
  country: string;
  network_count: number;
  ix_count: number;
  power_mw: number | null;
}

interface FacRow {
  slug: string;
  name: string;
  operator: string | null;
  city: string | null;
  country: string;
  power_mw: number | null;
  networks_at_facility: Array<{ count: number }> | null;
  ixes_at_facility: Array<{ count: number }> | null;
}

/**
 * Load every non-decommissioned facility with network/IX counts. Used by the
 * density-tier classifier and the network-density insight. Pagination matches
 * the rest of the loaders so the row cap follows a single pattern.
 */
async function fetchFacilitiesWithCounts(): Promise<DenseFacility[]> {
  const sb = supabaseServer();
  const out: DenseFacility[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select(
        "slug, name, operator, city, country, power_mw, networks_at_facility(count), ixes_at_facility(count)",
      )
      .neq("status", "decommissioned")
      .order("slug")
      .range(from, from + 999)
      .returns<FacRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(
      ...data.map((r) => ({
        slug: r.slug,
        name: r.name,
        operator: r.operator,
        city: r.city,
        country: r.country,
        power_mw: r.power_mw,
        network_count: r.networks_at_facility?.[0]?.count ?? 0,
        ix_count: r.ixes_at_facility?.[0]?.count ?? 0,
      })),
    );
    if (data.length < 1000) break;
  }
  return out;
}

export const loadFacilitiesWithCounts = unstable_cache(
  fetchFacilitiesWithCounts,
  ["facilities-with-counts-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export interface InsightCard {
  slug: string;
  title: string;
  one_liner: string;
  category: string;
}

export const INSIGHTS: InsightCard[] = [
  {
    slug: "most-network-dense-facilities",
    title: "The 50 most network-dense data centers on Earth",
    one_liner:
      "The carrier hotels that aren't carrier hotels — facilities concentrating the heaviest peering traffic in the world.",
    category: "Networks",
  },
  {
    slug: "largest-ixps-globally",
    title: "The 25 largest Internet Exchange Points by membership",
    one_liner:
      "DE-CIX, AMS-IX, MSK-IX, IX.br, LINX — ranked by member networks, with facility footprint and geographic span.",
    category: "Peering",
  },
  {
    slug: "peering-hub-metros",
    title: "Where the world peers: metros ranked by network density",
    one_liner:
      "Frankfurt vs. Ashburn vs. Singapore vs. Tokyo — the actual numbers behind &ldquo;the world's biggest peering hubs.&rdquo;",
    category: "Metros",
  },
];

export const INSIGHTS_BY_SLUG: Record<string, InsightCard> = Object.fromEntries(
  INSIGHTS.map((i) => [i.slug, i]),
);
