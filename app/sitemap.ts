import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { catalogIndexCache } from "@/lib/cache-tags";
import { loadOperatorIndex } from "@/lib/operators";
import { loadCountryIndex } from "@/lib/countries-data";
import { countrySlug } from "@/lib/countries";
import { loadMetroSummaries } from "@/lib/metros-data";
import { loadUsLocationIndex } from "@/lib/us-locations-data";
import { loadWorldCityIndex } from "@/lib/city-locations-data";
import { loadIxpIndex } from "@/lib/ixps-data";
import { loadTopNetworksIndex } from "@/lib/networks-data";
import { TIERS } from "@/lib/density";
import { INSIGHTS } from "@/lib/insights-data";
import {
  INDEXABLE_CAPS,
  IXP_MIN_FACILITIES,
  NETWORK_MIN_FACILITIES,
  OPERATOR_MIN_FACILITIES,
  isFacilityIndexable,
} from "@/lib/indexable";
import { canonicalOrigin } from "@/lib/census";

const SITE = canonicalOrigin();

export const revalidate = 86400;

/** Real row timestamp only. Never `new Date()`, never a recrawl floor. */
function sitemapLastmod(updatedAt?: string | null): Date | undefined {
  if (!updatedAt) return undefined;
  const d = new Date(updatedAt);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type FacSlugRow = {
  slug: string;
  updated_at: string | null;
};

// Every indexable facility page (coords present) is advertised in the sitemap,
// not just a top-N slice. lastmod is the row's `updated_at` only — a freshness
// floor made Google recrawl the whole catalog daily. The lat/lng filter mirrors
// isFacilityIndexable so we never list a coord-less page that renders noindex.
const loadIndexableFacilitiesWithStamps = unstable_cache(
  async (): Promise<FacSlugRow[]> => {
    const sb = supabaseServer();
    type Row = {
      slug: string;
      updated_at: string | null;
      lat: number | null;
      lng: number | null;
    };
    const rows: Row[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await sb
        .from("data_centers")
        .select("slug, updated_at, lat, lng")
        .neq("status", "decommissioned")
        .order("slug")
        .range(from, from + 999)
        .returns<Row[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows
      .filter((r) => isFacilityIndexable(r.lat, r.lng))
      .map((r) => ({ slug: r.slug, updated_at: r.updated_at }));
  },
  ["sitemap-indexable-facility-slugs-v1"],
  { ...catalogIndexCache, revalidate: 86_400 },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [facilities, operators, countries, metros, ixps, networks, usLocations, worldCities] = await Promise.all([
    loadIndexableFacilitiesWithStamps(),
    loadOperatorIndex(),
    loadCountryIndex(),
    loadMetroSummaries(),
    loadIxpIndex(),
    loadTopNetworksIndex(INDEXABLE_CAPS.networks),
    loadUsLocationIndex(),
    loadWorldCityIndex(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE}/about`, changeFrequency: "yearly", priority: 0.7 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/methodology`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/api`, changeFrequency: "yearly", priority: 0.7 },
    { url: `${SITE}/launch/mcp`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/operators`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/countries`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/metros`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/ixps`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/networks`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/density`, changeFrequency: "monthly", priority: 0.75 },
    { url: `${SITE}/insights`, changeFrequency: "monthly", priority: 0.75 },
    ...TIERS.map((t) => ({
      url: `${SITE}/density/${t.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...INSIGHTS.map((i) => ({
      url: `${SITE}/insights/${i.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.8,
    })),
  ];

  const facilityEntries: MetadataRoute.Sitemap = facilities.map((r) => {
    const lastModified = sitemapLastmod(r.updated_at);
    return {
      url: `${SITE}/facility/${r.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    };
  });

  // Top operators only — long-tail operators (1-2 facilities) still render
  // on demand but stay out of the sitemap to focus Google's crawl budget on
  // pages that can actually rank.
  const operatorEntries: MetadataRoute.Sitemap = operators
    .filter((o) => o.facility_count >= OPERATOR_MIN_FACILITIES && o.slug.length > 0)
    .slice(0, INDEXABLE_CAPS.operators)
    .map((o) => ({
      url: `${SITE}/operators/${o.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

  const countryEntries: MetadataRoute.Sitemap = countries.map((c) => ({
    url: `${SITE}/countries/${countrySlug(c.code)}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const metroEntries: MetadataRoute.Sitemap = metros.map((m) => ({
    url: `${SITE}/metros/${m.slug}`,
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  const usStateEntries: MetadataRoute.Sitemap = usLocations.states.map((s) => ({
    url: `${SITE}/countries/united-states/${s.slug}`,
    changeFrequency: "monthly",
    priority: 0.72,
  }));

  const usCityEntries: MetadataRoute.Sitemap = usLocations.cities.map((c) => ({
    url: `${SITE}/countries/united-states/${c.state_slug}/${c.city_slug}`,
    changeFrequency: "monthly",
    priority: 0.68,
  }));

  const worldCityEntries: MetadataRoute.Sitemap = worldCities.map((c) => ({
    url: `${SITE}/countries/${c.country_slug}/${c.city_slug}`,
    changeFrequency: "monthly",
    priority: 0.68,
  }));

  const ixpEntries: MetadataRoute.Sitemap = ixps
    .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.ixps)
    .map((i) => ({
      url: `${SITE}/ixps/${i.slug}`,
      changeFrequency: "monthly",
      priority: 0.65,
    }));

  const networkEntries: MetadataRoute.Sitemap = networks.top
    .filter((n) => n.facility_count >= NETWORK_MIN_FACILITIES)
    .map((n) => ({
      url: `${SITE}/networks/${n.asn}`,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [
    ...staticEntries,
    ...facilityEntries,
    ...operatorEntries,
    ...countryEntries,
    ...usStateEntries,
    ...usCityEntries,
    ...worldCityEntries,
    ...metroEntries,
    ...ixpEntries,
    ...networkEntries,
  ];
}
