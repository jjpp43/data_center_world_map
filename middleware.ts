import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/api/v1/:path*"],
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface ValidateRow {
  key_id: string;
  tier: string;
  remaining: number;
  monthly_limit: number;
}

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      authorization: `Bearer ${SUPABASE_ANON}`,
      "content-type": "application/json",
      prefer: "params=single-object",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

function applyRateHeaders(
  res: NextResponse,
  remaining: number,
  limit: number,
  tier: string,
): NextResponse {
  res.headers.set("X-RateLimit-Tier", tier);
  res.headers.set("X-RateLimit-Limit", String(limit));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  return res;
}

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return new NextResponse(
    JSON.stringify({ error: { status, message, ...extra } }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    },
  );
}

export async function middleware(req: NextRequest) {
  // Preflight still bypasses everything — route handlers reply OPTIONS.
  if (req.method === "OPTIONS") return NextResponse.next();

  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  if (!bearer) {
    return jsonError(401, "API key required — sign in at /login and create one from /dashboard/keys", {
      docs: "/api",
    });
  }

  const hash = await sha256Hex(bearer);
  const rows = await rpc<ValidateRow[]>("validate_and_charge_api_key", { p_hash: hash });
  const row = rows?.[0];
  if (!row) {
    return jsonError(401, "Invalid or revoked API key");
  }
  if (row.remaining <= 0) {
    const res = jsonError(429, "Monthly quota exceeded for this key", {
      tier: row.tier,
      monthly_limit: row.monthly_limit,
    });
    return applyRateHeaders(res, 0, row.monthly_limit, row.tier);
  }
  const res = NextResponse.next();
  return applyRateHeaders(res, row.remaining, row.monthly_limit, row.tier);
}

