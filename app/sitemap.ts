import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import { loadOperatorSummaries } from "@/lib/operators";
import { loadCountrySummaries } from "@/lib/countries-data";
import { countrySlug } from "@/lib/countries";
import { loadMetroSummaries } from "@/lib/metros-data";
import { loadIxpSummaries } from "@/lib/ixps-data";
import { loadNetworkSummaries } from "@/lib/networks-data";
import { TIERS } from "@/lib/density";
import { INSIGHTS } from "@/lib/insights-data";
import {
  INDEXABLE_CAPS,
  IXP_MIN_FACILITIES,
  NETWORK_MIN_FACILITIES,
  OPERATOR_MIN_FACILITIES,
  isFacilityIndexable,
} from "@/lib/indexable";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

export const revalidate = 86400;

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
  { revalidate: 86_400, tags: ["data-centers"] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [facilities, operators, countries, metros, ixps, networks] = await Promise.all([
    loadIndexableFacilitiesWithStamps(),
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
