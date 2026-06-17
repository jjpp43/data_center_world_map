import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { supabaseServer } from "@/lib/supabase";
import {
  csv,
  csvResponse,
  errorResponse,
  internalError,
  jsonResponse,
  preflight,
} from "@/lib/api";

export const runtime = "nodejs";

type Row = {
  provider: string;
  code: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  az_count: number | null;
  launched_year: number | null;
  services: string[] | null;
  source_url: string | null;
};

const VALID_PROVIDERS = new Set(["aws", "gcp", "azure", "oracle"]);

const getCloudRegions = unstable_cache(
  async (providers: string[], countries: string[]): Promise<Row[]> => {
    const sb = supabaseServer();
    let q = sb
      .from("cloud_regions")
      .select(
        "provider, code, name, city, country, lat, lng, az_count, launched_year, services, source_url",
      )
      .order("provider")
      .order("code");
    if (providers.length > 0) q = q.in("provider", providers);
    if (countries.length > 0) q = q.in("country", countries);

    const { data, error } = await q.returns<Row[]>();
    if (error) throw new Error(`query failed: ${error.message}`);
    return data ?? [];
  },
  ["api-v1-cloud-regions-v1"],
  { revalidate: 86400, tags: ["data-centers"] },
);

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

  let rows: Row[];
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
