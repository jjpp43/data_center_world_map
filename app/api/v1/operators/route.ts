import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import {
  clampInt,
  csv,
  csvResponse,
  errorResponse,
  internalError,
  jsonResponse,
  preflight,
} from "@/lib/api";

export const runtime = "nodejs";

type Row = { operator: string | null; country: string };
type Aggregate = { operator: string; facility_count: number; country_count: number };

const getOperatorAggregates = unstable_cache(
  async (countries: string[]): Promise<Aggregate[]> => {
    const sb = supabaseServer();
    const all: Row[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      let q = sb
        .from("data_centers")
        .select("operator, country")
        .neq("status", "decommissioned")
        .order("slug")
        .range(from, from + 999);
      if (countries.length > 0) q = q.in("country", countries);
      const { data, error } = await q.returns<Row[]>();
      if (error) throw new Error(`query failed: ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
    }

    const counts = new Map<string, { facility_count: number; countries: Set<string> }>();
    for (const r of all) {
      const op = r.operator ?? "(unknown)";
      let agg = counts.get(op);
      if (!agg) {
        agg = { facility_count: 0, countries: new Set() };
        counts.set(op, agg);
      }
      agg.facility_count++;
      agg.countries.add(r.country);
    }

    return [...counts.entries()]
      .map(([operator, agg]) => ({
        operator,
        facility_count: agg.facility_count,
        country_count: agg.countries.size,
      }))
      .sort((a, b) => b.facility_count - a.facility_count);
  },
  ["api-v1-operators-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);

export function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const countries = csv(sp.get("country")).map((c) => c.toUpperCase());
  const minFacilities = clampInt(sp.get("min_facilities"), 1, 1, 10_000);
  const limit = clampInt(sp.get("limit"), 100, 1, 1000);
  const format = (sp.get("format") ?? "json").toLowerCase();

  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be 'json' or 'csv'");
  }

  let aggregates: Aggregate[];
  try {
    aggregates = await getOperatorAggregates(countries);
  } catch (e) {
    return internalError("api/v1/operators", e);
  }

  const rows = aggregates
    .filter((r) => r.facility_count >= minFacilities)
    .slice(0, limit);

  if (format === "csv") {
    return csvResponse(rows, { filename: "operators.csv", cache: "aggregate" });
  }

  return jsonResponse(
    {
      data: rows,
      meta: { total: rows.length },
    },
    { cache: "aggregate" },
  );
}
