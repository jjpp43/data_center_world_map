import { NextRequest } from "next/server";
import { getFacilitiesPage, type FacilityListRow } from "@/lib/api-data";
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
  const limit = clampInt(sp.get("limit"), 50, 1, 500);
  const offset = clampInt(sp.get("offset"), 0, 0, 1_000_000);
  const countries = csv(sp.get("country")).map((c) => c.toUpperCase());
  const operators = csv(sp.get("operator"));
  const minPowerMwRaw = parseFloat(sp.get("min_power_mw") ?? "");
  const minPowerMw = Number.isFinite(minPowerMwRaw) ? minPowerMwRaw : null;
  const status = sp.get("status");
  const format = (sp.get("format") ?? "json").toLowerCase();

  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be 'json' or 'csv'");
  }

  let rows: FacilityListRow[];
  let total: number;
  try {
    ({ rows, total } = await getFacilitiesPage({
      countries,
      operators,
      minPowerMw,
      status,
      limit,
      offset,
    }));
  } catch (e) {
    return internalError("api/v1/facilities", e);
  }

  if (format === "csv") {
    return csvResponse(rows, { filename: "facilities.csv" });
  }

  const nextOffset = offset + rows.length;
  return jsonResponse({
    data: rows,
    meta: {
      total,
      returned: rows.length,
      limit,
      offset,
      next_offset: nextOffset < total ? nextOffset : null,
    },
  });
}
