import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { catalogIndexCache } from "@/lib/cache-tags";
import { loadOperatorIndex } from "@/lib/operators";
import { loadCountryIndex } from "@/lib/countries-data";
import { countrySlug } from "@/lib/countries";
import { loadMetroSummaries } from "@/lib/metros-data";
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

/**
 * Floor for sitemap lastmod. Live catalog `updated_at` is still 4 Jun 2026,
 * which is *before* f9e3832 noindexed ~91% of facility URLs (25 Jun) and
 * 16c7101 restored indexability (30 Jun). Google already fetched the sitemap
 * with those June-4 stamps, so it has no lastmod reason to recrawl. A module
 * constant (not `new Date()`) keeps sitemap bytes identical across daily
 * regenerations. Bump this when we need another catalog recrawl.
 */
const LASTMOD_FLOOR = new Date("2026-06-30T00:00:00.000Z");

function sitemapLastmod(updatedAt?: string | null): Date {
  const ts = updatedAt ? new Date(updatedAt).getTime() : 0;
  return new Date(Math.max(ts, LASTMOD_FLOOR.getTime()));
}

type FacSlugRow = {
  slug: string;
  updated_at: string | null;
};

// Every indexable facility page (coords present) is advertised in the sitemap,
// not just a top-N slice — facility pages are the primary rankable content and
// each is unique, so we want Google to discover and (re)crawl all of them. This
// is also what pulls the ~5k long-tail pages out of the June noindex regression:
// they're `index,follow` again but have no other signal prompting a re-crawl.
// One paginated scan of (slug, updated_at, lat, lng) per 24h; timestamps are
// read inline because a top-N `.in(slug, …)` lookup would exceed the request
// URL limit at full-catalog size. The lat/lng filter mirrors isFacilityIndexable
// so we never list a coord-less page that renders noindex.
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
  const [facilities, operators, countries, metros, ixps, networks] = await Promise.all([
    loadIndexableFacilitiesWithStamps(),
    loadOperatorIndex(),
    loadCountryIndex(),
    loadMetroSummaries(),
    loadIxpIndex(),
    loadTopNetworksIndex(INDEXABLE_CAPS.networks),
  ]);

  // lastModified uses LASTMOD_FLOOR, never `new Date()`. Stamping request
  // time flipped sitemap bytes every daily revalidation and burned an ISR
  // write per cycle. The floor is the noindex-restore day so Google sees a
  // one-time lastmod bump vs the live 2026-06-04 stamps.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: LASTMOD_FLOOR, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/about`, lastModified: LASTMOD_FLOOR, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/privacy`, lastModified: LASTMOD_FLOOR, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/methodology`, lastModified: LASTMOD_FLOOR, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/api`, lastModified: LASTMOD_FLOOR, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/launch/mcp`, lastModified: LASTMOD_FLOOR, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/operators`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/countries`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/metros`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/ixps`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/networks`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/density`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.75 },
    { url: `${SITE}/insights`, lastModified: LASTMOD_FLOOR, changeFrequency: "weekly", priority: 0.75 },
    ...TIERS.map((t) => ({
      url: `${SITE}/density/${t.slug}`,
      lastModified: LASTMOD_FLOOR,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...INSIGHTS.map((i) => ({
      url: `${SITE}/insights/${i.slug}`,
      lastModified: LASTMOD_FLOOR,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  const facilityEntries: MetadataRoute.Sitemap = facilities.map((r) => ({
    url: `${SITE}/facility/${r.slug}`,
    lastModified: sitemapLastmod(r.updated_at),
    changeFrequency: "monthly",
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
      lastModified: LASTMOD_FLOOR,
      changeFrequency: "monthly",
      priority: 0.7,
    }));

  const countryEntries: MetadataRoute.Sitemap = countries.map((c) => ({
    url: `${SITE}/countries/${countrySlug(c.code)}`,
    lastModified: LASTMOD_FLOOR,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const metroEntries: MetadataRoute.Sitemap = metros.map((m) => ({
    url: `${SITE}/metros/${m.slug}`,
    lastModified: LASTMOD_FLOOR,
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  const ixpEntries: MetadataRoute.Sitemap = ixps
    .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.ixps)
    .map((i) => ({
      url: `${SITE}/ixps/${i.slug}`,
      lastModified: LASTMOD_FLOOR,
      changeFrequency: "monthly",
      priority: 0.65,
    }));

  const networkEntries: MetadataRoute.Sitemap = networks.top
    .filter((n) => n.facility_count >= NETWORK_MIN_FACILITIES)
    .map((n) => ({
      url: `${SITE}/networks/${n.asn}`,
      lastModified: LASTMOD_FLOOR,
      changeFrequency: "monthly",
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
