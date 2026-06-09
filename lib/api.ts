import { NextResponse } from "next/server";

export const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

type CacheBudget = "list" | "detail" | "aggregate";

const CACHE: Record<CacheBudget, string> = {
  list: "public, s-maxage=300, stale-while-revalidate=3600",
  detail: "public, s-maxage=3600, stale-while-revalidate=86400",
  aggregate: "public, s-maxage=3600, stale-while-revalidate=86400",
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
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
