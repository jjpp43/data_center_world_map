import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Daily Vercel cron at 03:00 UTC → pings the Vercel Deploy Hook so the build
 * pipeline re-bakes public/{facilities,cloud-regions}.geojson with fresh data.
 *
 * Vercel automatically sends `Authorization: Bearer $CRON_SECRET` for cron
 * invocations when CRON_SECRET is set as an env var. We gate on that so an
 * attacker can't burn deploy quota by hitting this URL.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/refresh-geojson] CRON_SECRET not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const presented = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!timingSafeEqual(presented, expected)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    return NextResponse.json(
      { error: "VERCEL_DEPLOY_HOOK_URL not configured" },
      { status: 500 },
    );
  }

  const res = await fetch(hookUrl, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `deploy hook ${res.status}`, detail: body.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ triggered: true, at: new Date().toISOString() });
}
