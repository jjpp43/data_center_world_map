import { NextRequest } from "next/server";
import { getFacilityDetail } from "@/lib/api-data";
import { errorResponse, internalError, jsonResponse, preflight } from "@/lib/api";

export const runtime = "nodejs";

// Cheap shape gate so random/garbage slugs don't burn an unstable_cache
// miss + Supabase round-trip apiece. Real slugs are kebab-case ASCII.
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

export function OPTIONS() {
  return preflight();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!SLUG_SHAPE.test(slug)) {
    return errorResponse(`facility not found: ${slug}`, 404);
  }

  let detail: Awaited<ReturnType<typeof getFacilityDetail>>;
  try {
    detail = await getFacilityDetail(slug);
  } catch (e) {
    return internalError("api/v1/facilities/[slug]", e);
  }

  if (!detail) return errorResponse(`facility not found: ${slug}`, 404);

  return jsonResponse({ data: detail }, { cache: "detail" });
}
