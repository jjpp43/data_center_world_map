import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";
import { API_DATA_TAG, CATALOG_INDEX_TAG } from "@/lib/cache-tags";

export const runtime = "nodejs";

const TAGS = [CATALOG_INDEX_TAG, API_DATA_TAG] as const;

/**
 * Pages that fetch Supabase directly (no tagged unstable_cache). revalidateTag
 * cannot reach them; revalidatePath marks just these URLs stale.
 */
const UNCACHE_PATHS = ["/about", "/insights/peering-hub-metros"] as const;

/**
 * On-demand ISR for index/aggregate pages only. Per-slug facility/operator/
 * country/metro/ixp/network pages are 30d time-based — they must not share a
 * tag with this route. Blasting `data-centers` previously SWR-staled ~5,800
 * facility pages and the next crawl billed a full catalog of ISR writes.
 *
 * Called from ingest scripts (`triggerRevalidate`).
 */
export async function POST(req: NextRequest) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  for (const tag of TAGS) revalidateTag(tag, "max");
  for (const path of UNCACHE_PATHS) revalidatePath(path);

  return NextResponse.json({
    revalidated: { tags: TAGS, paths: UNCACHE_PATHS },
    at: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
