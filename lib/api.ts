import { NextResponse } from "next/server";

export const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

type CacheBudget = "list" | "detail" | "aggregate";

// `private` keeps the CDN from caching per-user headers (X-RateLimit-*)
// across keys. unstable_cache (24h) carries the Supabase-dedup load that
// the public CDN cache used to provide.
const CACHE: Record<CacheBudget, string> = {
  list: "private, max-age=300, must-revalidate",
  detail: "private, max-age=3600, must-revalidate",
  aggregate: "private, max-age=3600, must-revalidate",
};

export function jsonResponse(
  body: unknown,
  options: { cache?: CacheBudget; status?: number } = {},
): NextResponse {
  const { cache = "list", status = 200 } = options;
  return NextResponse.json(body, {
    status,
    headers: {
      ...PUBLIC_CORS,
      "Cache-Control": CACHE[cache],
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function csvResponse(
  rows: Array<Record<string, unknown>>,
  options: { filename?: string; cache?: CacheBudget } = {},
): NextResponse {
  const { filename = "data.csv", cache = "list" } = options;
  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...PUBLIC_CORS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": CACHE[cache],
    },
  });
}

export function errorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json(
    { error: { message, status } },
    {
      status,
      headers: { ...PUBLIC_CORS, "Cache-Control": "no-store" },
    },
  );
}

// Log the real error server-side, return a generic 500 with a short id
// the caller can share when reporting. Prevents PostgREST/Supabase error
// strings (table names, constraint hints, SQL fragments) from leaking.
export function internalError(scope: string, e: unknown): NextResponse {
  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[${id}] ${scope}:`, e);
  return errorResponse(`internal error (id: ${id})`, 500);
}

export function preflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_CORS,
  });
}

export function clampInt(
  v: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (v == null) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function csv(s: string | null): string[] {
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const keys = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      for (const k of Object.keys(r)) acc.add(k);
      return acc;
    }, new Set()),
  );
  const head = keys.join(",");
  const body = rows
    .map((r) => keys.map((k) => escapeCsvCell(r[k])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}

function escapeCsvCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return escapeCsvCell(JSON.stringify(v));
  let s = String(v);
  // Neutralize CSV/spreadsheet formula execution on cells whose first
  // character would be interpreted as a formula by Excel/Sheets/Numbers.
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
