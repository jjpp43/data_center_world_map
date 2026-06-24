import { unstable_cache } from "next/cache";
import { supabaseServer } from "./supabase";

export const loadTopFacilitySlugs = unstable_cache(
  async (limit: number): Promise<string[]> => {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from("facility_density")
      .select("slug")
      .order("network_count", { ascending: false })
      .limit(limit)
      .returns<{ slug: string }[]>();
    if (error) throw error;
    return (data ?? []).map((r) => r.slug);
  },
  ["top-facility-slugs-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);
