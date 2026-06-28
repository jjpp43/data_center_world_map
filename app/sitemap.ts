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
  const [facilities, operators, countries, metros, ixps, networks] = await Promise.all([
    loadTopFacilitiesWithStamps(),
    loadOperatorSummaries(),
    loadCountrySummaries(),
    loadMetroSummaries(),
    loadIxpSummaries(),
    loadNetworkSummaries(),
  ]);

  // lastModified only set on entries with a real data-driven timestamp
  // (facility `updated_at`). Stamping `new Date()` everywhere flips the
  // sitemap bytes on every revalidation and burns an ISR write per cycle
  // without giving Google any real freshness signal.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/methodology`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/api`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/launch/mcp`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/operators`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/countries`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/metros`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/ixps`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/networks`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/density`, changeFrequency: "weekly", priority: 0.75 },
    { url: `${SITE}/insights`, changeFrequency: "weekly", priority: 0.75 },
    ...TIERS.map((t) => ({
      url: `${SITE}/density/${t.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...INSIGHTS.map((i) => ({
      url: `${SITE}/insights/${i.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  const facilityEntries: MetadataRoute.Sitemap = facilities.map((r) => ({
    url: `${SITE}/facility/${r.slug}`,
    ...(r.updated_at ? { lastModified: new Date(r.updated_at) } : {}),
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
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const countryEntries: MetadataRoute.Sitemap = countries.map((c) => ({
    url: `${SITE}/countries/${countrySlug(c.code)}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const metroEntries: MetadataRoute.Sitemap = metros.map((m) => ({
    url: `${SITE}/metros/${m.slug}`,
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  const ixpEntries: MetadataRoute.Sitemap = ixps
    .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.ixps)
    .map((i) => ({
      url: `${SITE}/ixps/${i.slug}`,
      changeFrequency: "weekly",
      priority: 0.65,
    }));

  const networkEntries: MetadataRoute.Sitemap = networks
    .filter((n) => n.facility_count >= NETWORK_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.networks)
    .map((n) => ({
      url: `${SITE}/networks/${n.asn}`,
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
