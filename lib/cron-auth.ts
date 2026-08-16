import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 500 if CRON_SECRET is unset, 401 if the bearer token does not match. */
export function cronAuthError(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron] CRON_SECRET not configured");
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const presented = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!timingSafeEqual(presented, expected)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  return null;
}
