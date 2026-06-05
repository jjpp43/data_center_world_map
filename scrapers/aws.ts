import * as cheerio from "cheerio";
import { cachedFetch } from "./common/http.ts";
import { emitCloudRegions, loadMetros } from "./common/cloud.ts";

const URL = "https://aws.amazon.com/about-aws/global-infrastructure/regions_az/";

/**
 * Best-effort enrichment: scrape the public AWS regions page for AZ counts
 * and launch years per region code. We do NOT use this page for coordinates —
 * those come from data/aws_metros.json. If parsing fails (page restructure),
 * the curated metro data still produces a complete record set.
 */
async function fetchEnrichment(): Promise<Record<string, { az_count?: number; launched_year?: number }>> {
  const out: Record<string, { az_count?: number; launched_year?: number }> = {};
  try {
    const res = await cachedFetch(URL, {
      cacheNamespace: "aws",
      cacheKey: "regions_az-html",
      maxRetries: 1,
    });
    const $ = cheerio.load(res.body);
    $("table tr").each((_, tr) => {
      const cells = $(tr)
        .find("td")
        .map((_i, td) => $(td).text().trim())
        .get();
      if (cells.length < 2) return;
      const codeCell = cells.find((c) => /^[a-z]{2}-[a-z]+-\d+$/.test(c));
      if (!codeCell) return;
      const azCell = cells.find((c) => /^\d{1,2}$/.test(c));
      const yearCell = cells.find((c) => /^(19|20)\d{2}$/.test(c));
      const entry: { az_count?: number; launched_year?: number } = {};
      if (azCell) entry.az_count = Number(azCell);
      if (yearCell) entry.launched_year = Number(yearCell);
      if (entry.az_count !== undefined || entry.launched_year !== undefined) {
        out[codeCell] = entry;
      }
    });
  } catch (err) {
    process.stderr.write(`[aws] enrichment fetch failed (${(err as Error).message}); using curated data only\n`);
  }
  return out;
}

export async function scrapeAws(): Promise<{ accepted: number; rejected: number }> {
  const metros = await loadMetros("aws_metros.json");
  const enrichment = await fetchEnrichment();
  return emitCloudRegions({
    provider: "aws",
    metros,
    sourceUrl: URL,
    outFile: "cloud_regions.aws.jsonl",
    enrichment,
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeAws().catch((err) => {
    console.error("[aws] fatal:", err);
    process.exit(1);
  });
}
