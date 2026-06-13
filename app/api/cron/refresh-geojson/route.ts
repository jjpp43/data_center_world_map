import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

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
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
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
