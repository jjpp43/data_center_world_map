import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";

export const runtime = "nodejs";

const TAGS = ["data-centers", "networks", "ixes"] as const;

/**
 * On-demand ISR revalidation for catalog pages. Marks tagged entries stale
 * (SWR, `'max'` profile) so the next hit regenerates in the background.
 * Unchanged HTML incurs no ISR write. Prefer this over a deploy: a new
 * deployment starts an empty ISR cache and rewrites every slug on first crawl.
 *
 * Called from ingest scripts (`triggerRevalidate`).
 */
export async function POST(req: NextRequest) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  for (const tag of TAGS) revalidateTag(tag, "max");

  return NextResponse.json({ revalidated: TAGS, at: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
