import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { countryName } from "@/lib/countries";
import { csvResponse, errorResponse, jsonResponse, preflight } from "@/lib/api";

export const runtime = "nodejs";

type Row = { country: string };

export function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") ?? "json").toLowerCase();

  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be 'json' or 'csv'");
  }

  const sb = supabaseServer();
  const all: Row[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("country")
      .neq("status", "decommissioned")
      .order("slug")
      .range(from, from + 999)
      .returns<Row[]>();
    if (error) return errorResponse(`query failed: ${error.message}`, 500);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }

  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.country, (counts.get(r.country) ?? 0) + 1);

  const rows = [...counts.entries()]
    .map(([code, n]) => ({
      country: code,
      country_name: countryName(code) ?? null,
      facility_count: n,
    }))
    .sort((a, b) => b.facility_count - a.facility_count);

  if (format === "csv") {
    return csvResponse(rows, { filename: "countries.csv", cache: "aggregate" });
  }

  return jsonResponse(
    {
      data: rows,
      meta: { total: rows.length },
    },
    { cache: "aggregate" },
  );
}
