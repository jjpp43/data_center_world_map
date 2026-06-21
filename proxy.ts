import { NextResponse, type NextRequest } from "next/server";

export const config = {
  // /api/v1/*: REST endpoints. /api/mcp: Streamable HTTP MCP transport
  // (single endpoint, JSON-RPC inside POST body). Both share the same
  // Bearer auth + per-key monthly quota path.
  matcher: ["/api/v1/:path*", "/api/mcp"],
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Per-instance negative cache for known-invalid Bearer hashes. Absorbs
// junk-token floods so we don't fire a Supabase RPC per request. Capped
// to bound memory under a sustained spray; insertion-order eviction
// matches Map semantics so the oldest entry drops first.
const INVALID_TOKEN_TTL_MS = 60_000;
const INVALID_TOKEN_CACHE_MAX = 1024;
const invalidTokenCache = new Map<string, number>();

function isKnownInvalid(hash: string): boolean {
  const exp = invalidTokenCache.get(hash);
  if (exp == null) return false;
  if (exp < Date.now()) {
    invalidTokenCache.delete(hash);
    return false;
  }
  return true;
}

function rememberInvalid(hash: string): void {
  if (invalidTokenCache.size >= INVALID_TOKEN_CACHE_MAX) {
    const oldest = invalidTokenCache.keys().next().value;
    if (oldest !== undefined) invalidTokenCache.delete(oldest);
  }
  invalidTokenCache.set(hash, Date.now() + INVALID_TOKEN_TTL_MS);
}

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

// Streamable-HTTP MCP sessions issue several JSON-RPC POSTs that aren't
// tool calls — protocol handshake, capability discovery, and fire-and-forget
// notifications. Charging quota for those burns Free-tier credits before the
// agent does any useful work, so we still validate the key (to gate access
// and emit X-RateLimit-* headers) but pass p_charge=false to the RPC.
const MCP_NO_CHARGE_METHODS = new Set([
  "initialize",
  "ping",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
]);

function isNoChargeMcpMethod(method: unknown): boolean {
  if (typeof method !== "string") return false;
  if (method.startsWith("notifications/")) return true;
  return MCP_NO_CHARGE_METHODS.has(method);
}

type McpClassification =
  | { kind: "charge" }
  | { kind: "skip" }
  | { kind: "reject"; status: number; message: string };

function methodOf(entry: unknown): unknown {
  if (typeof entry !== "object" || entry === null) return undefined;
  return (entry as { method?: unknown }).method;
}

// Pre-validate /api/mcp POSTs before auth/charging. Anything that can't
// reach a tool — wrong Accept header, unparseable body, missing JSON-RPC
// method — is rejected directly without touching Supabase. The handler
// would otherwise 400/406 *after* proxy.ts had already charged the key.
async function classifyMcpRequest(req: NextRequest): Promise<McpClassification> {
  // GET/DELETE on the MCP route are stream lifecycle (SSE disabled here),
  // never carry JSON-RPC bodies, never billable.
  if (req.method !== "POST") return { kind: "skip" };

  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return {
      kind: "reject",
      status: 406,
      message:
        "MCP requests must include 'application/json, text/event-stream' in Accept",
    };
  }

  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return { kind: "reject", status: 400, message: "Request body must be valid JSON" };
  }

  if (Array.isArray(body)) {
    for (const entry of body) {
      if (typeof methodOf(entry) !== "string") {
        return {
          kind: "reject",
          status: 400,
          message: "JSON-RPC batch entry missing method string",
        };
      }
    }
    return body.some((e) => !isNoChargeMcpMethod(methodOf(e)))
      ? { kind: "charge" }
      : { kind: "skip" };
  }

  const method = methodOf(body);
  if (typeof method !== "string") {
    return {
      kind: "reject",
      status: 400,
      message: "JSON-RPC request missing method string",
    };
  }
  return isNoChargeMcpMethod(method) ? { kind: "skip" } : { kind: "charge" };
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

export async function proxy(req: NextRequest) {
  // Preflight still bypasses everything — route handlers reply OPTIONS.
  if (req.method === "OPTIONS") return NextResponse.next();

  const isMcp = req.nextUrl.pathname === "/api/mcp";
  let mcp: McpClassification | null = null;
  if (isMcp) {
    mcp = await classifyMcpRequest(req);
    if (mcp.kind === "reject") {
      return jsonError(mcp.status, mcp.message);
    }
  }

  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  if (!bearer) {
    return jsonError(401, "API key required — sign in at /login and create one from /dashboard", {
      docs: "/api",
    });
  }

  const hash = await sha256Hex(bearer);
  if (isKnownInvalid(hash)) {
    return jsonError(401, "Invalid or revoked API key");
  }
  const charge = isMcp ? mcp!.kind === "charge" : true;
  const rows = await rpc<ValidateRow[]>("validate_and_charge_api_key", {
    p_hash: hash,
    p_charge: charge,
  });
  const row = rows?.[0];
  if (!row) {
    rememberInvalid(hash);
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

