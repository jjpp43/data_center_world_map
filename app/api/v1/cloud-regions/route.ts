import { NextRequest } from "next/server";
import { getCloudRegions, type CloudRegionRow } from "@/lib/api-data";
import {
  csv,
  csvResponse,
  errorResponse,
  internalError,
  jsonResponse,
  preflight,
} from "@/lib/api";

export const runtime = "nodejs";

const VALID_PROVIDERS = new Set(["aws", "gcp", "azure", "oracle"]);

export function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = csv(sp.get("provider")).map((p) => p.toLowerCase());
  const countries = csv(sp.get("country")).map((c) => c.toUpperCase());
  const format = (sp.get("format") ?? "json").toLowerCase();

  if (format !== "json" && format !== "csv") {
    return errorResponse("format must be 'json' or 'csv'");
  }
  for (const p of providers) {
    if (!VALID_PROVIDERS.has(p)) {
      return errorResponse(`unknown provider '${p}' — valid: aws, gcp, azure, oracle`);
    }
  }

  let rows: CloudRegionRow[];
  try {
    rows = await getCloudRegions(providers, countries);
  } catch (e) {
    return internalError("api/v1/cloud-regions", e);
  }

  if (format === "csv") {
    return csvResponse(rows, { filename: "cloud-regions.csv", cache: "aggregate" });
  }

  return jsonResponse(
    {
      data: rows,
      meta: { total: rows.length },
    },
    { cache: "aggregate" },
  );
}
