import { NextRequest } from "next/server";
import { getOperatorAggregates, type OperatorAggregate } from "@/lib/api-data";
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

  let aggregates: OperatorAggregate[];
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
