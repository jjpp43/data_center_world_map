import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { loadOperatorSummaries } from "@/lib/operators";
import { loadCountrySummaries } from "@/lib/countries-data";
import { countrySlug } from "@/lib/countries";
import { loadMetroSummaries } from "@/lib/metros-data";
import { loadIxpSummaries } from "@/lib/ixps-data";
import { loadNetworkSummaries } from "@/lib/networks-data";
import { loadTopFacilitySlugs } from "@/lib/facilities-data";
import { TIERS } from "@/lib/density";
import { INSIGHTS } from "@/lib/insights-data";
import {
  INDEXABLE_CAPS,
  IXP_MIN_FACILITIES,
  NETWORK_MIN_FACILITIES,
  OPERATOR_MIN_FACILITIES,
} from "@/lib/indexable";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

export const revalidate = 86400;

type FacSlugRow = {
  slug: string;
  updated_at: string | null;
};

const loadTopFacilitiesWithStamps = unstable_cache(
  async (): Promise<FacSlugRow[]> => {
    const slugs = await loadTopFacilitySlugs(INDEXABLE_CAPS.facilities);
    // Note: this loader is still keyed on `sitemap-top-facility-slugs-v2`
    // — bump if the caps change so the cached array is regenerated.
    if (slugs.length === 0) return [];
    const sb = supabaseServer();
    const { data: stamps } = await sb
      .from("data_centers")
      .select("slug, updated_at")
      .in("slug", slugs)
      .returns<{ slug: string; updated_at: string | null }[]>();
    const stampBySlug = new Map((stamps ?? []).map((s) => [s.slug, s.updated_at]));
    return slugs.map((slug) => ({ slug, updated_at: stampBySlug.get(slug) ?? null }));
  },
  ["sitemap-top-facility-slugs-v2"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [facilities, operators, countries, metros, ixps, networks] = await Promise.all([
    loadTopFacilitiesWithStamps(),
    loadOperatorSummaries(),
    loadCountrySummaries(),
    loadMetroSummaries(),
    loadIxpSummaries(),
    loadNetworkSummaries(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/api`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/launch/mcp`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/operators`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/countries`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/metros`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/ixps`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/networks`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/density`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    { url: `${SITE}/insights`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    ...TIERS.map((t) => ({
      url: `${SITE}/density/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...INSIGHTS.map((i) => ({
      url: `${SITE}/insights/${i.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  const facilityEntries: MetadataRoute.Sitemap = facilities.map((r) => ({
    url: `${SITE}/facility/${r.slug}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // Top operators only — long-tail operators (1-2 facilities) still render
  // on demand but stay out of the sitemap to focus Google's crawl budget on
  // pages that can actually rank.
  const operatorEntries: MetadataRoute.Sitemap = operators
    .filter((o) => o.facility_count >= OPERATOR_MIN_FACILITIES && o.slug.length > 0)
    .slice(0, INDEXABLE_CAPS.operators)
    .map((o) => ({
      url: `${SITE}/operators/${o.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const countryEntries: MetadataRoute.Sitemap = countries.map((c) => ({
    url: `${SITE}/countries/${countrySlug(c.code)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const metroEntries: MetadataRoute.Sitemap = metros.map((m) => ({
    url: `${SITE}/metros/${m.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  const ixpEntries: MetadataRoute.Sitemap = ixps
    .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.ixps)
    .map((i) => ({
      url: `${SITE}/ixps/${i.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.65,
    }));

  const networkEntries: MetadataRoute.Sitemap = networks
    .filter((n) => n.facility_count >= NETWORK_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.networks)
    .map((n) => ({
      url: `${SITE}/networks/${n.asn}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  return [
    ...staticEntries,
    ...facilityEntries,
    ...operatorEntries,
    ...countryEntries,
    ...metroEntries,
    ...ixpEntries,
    ...networkEntries,
  ];
}
