import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase";

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
  const rows = await loadFacilitySlugs();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const facilityEntries: MetadataRoute.Sitemap = rows.map((r) => ({
    url: `${SITE}/facility/${r.slug}`,
    lastModified: r.updated_at ? new Date(r.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...facilityEntries];
}
