import { NextRequest } from "next/server";
import { getCountryAggregates, type CountryAggregate } from "@/lib/api-data";
import {
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
  const format = (sp.get("format") ?? "json").toLowerCase();

  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be 'json' or 'csv'");
  }

  let rows: CountryAggregate[];
  try {
    rows = await getCountryAggregates();
  } catch (e) {
    return internalError("api/v1/countries", e);
  }

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
