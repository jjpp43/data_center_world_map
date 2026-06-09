import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";
import { loadOperatorSummaries } from "@/lib/operators";
import { loadCountrySummaries } from "@/lib/countries-data";
import { loadMetroSummaries } from "@/lib/metros-data";
import { loadIxpSummaries } from "@/lib/ixps-data";
import { loadNetworkSummaries } from "@/lib/networks-data";
import { TIERS } from "@/lib/density";
import { INSIGHTS } from "@/lib/insights-data";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

export const revalidate = 86400;

type Row = { slug: string; updated_at: string | null };

async function loadFacilitySlugs(): Promise<Row[]> {
  const sb = supabaseServer();
  const all: Row[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("slug, updated_at")
      .neq("status", "decommissioned")
      .order("slug")
      .range(from, from + 999)
      .returns<Row[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [facilities, operators, countries, metros, ixps, networks] = await Promise.all([
    loadFacilitySlugs(),
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

  // Single-facility operators don't need their own listing — their one facility
  // page already covers it. We still render that route on demand; we just keep
  // it out of the sitemap to avoid diluting it.
  const operatorEntries: MetadataRoute.Sitemap = operators
    .filter((o) => o.facility_count >= 2 && o.slug.length > 0)
    .map((o) => ({
      url: `${SITE}/operators/${o.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const countryEntries: MetadataRoute.Sitemap = countries.map((c) => ({
    url: `${SITE}/countries/${c.code.toLowerCase()}`,
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
    .filter((i) => i.facility_count > 0)
    .map((i) => ({
      url: `${SITE}/ixps/${i.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.65,
    }));

  // Networks: only list ASNs present in ≥2 facilities. Single-facility ASNs
  // make for thin pages and bloat the sitemap.
  const networkEntries: MetadataRoute.Sitemap = networks
    .filter((n) => n.facility_count >= 2)
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
