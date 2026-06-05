import * as cheerio from "cheerio";
import { cachedFetch } from "./common/http.ts";
import { emitCloudRegions, loadMetros } from "./common/cloud.ts";

const URL = "https://cloud.google.com/about/locations";

async function fetchEnrichment(): Promise<Record<string, { launched_year?: number }>> {
  const out: Record<string, { launched_year?: number }> = {};
  try {
    const res = await cachedFetch(URL, {
      cacheNamespace: "gcp",
      cacheKey: "locations-html",
      maxRetries: 1,
    });
    const $ = cheerio.load(res.body);
    // GCP region codes appear inline in the page near region names. Match any
    // token shaped like a GCP region code and look for a sibling year.
    const text = $.text();
    const codeRe = /\b((?:asia|africa|australia|europe|me|northamerica|southamerica|us)-[a-z0-9-]+\d+)\b/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(text))) {
      const code = m[1]!;
      if (out[code]) continue;
      const window = text.slice(Math.max(0, m.index - 200), Math.min(text.length, m.index + 200));
      const yr = window.match(/\b(20\d{2})\b/);
      if (yr && yr[1]) out[code] = { launched_year: Number(yr[1]) };
    }
  } catch (err) {
    process.stderr.write(`[gcp] enrichment fetch failed (${(err as Error).message}); using curated data only\n`);
  }
  return out;
}

export async function scrapeGcp(): Promise<{ accepted: number; rejected: number }> {
  const metros = await loadMetros("gcp_metros.json");
  const enrichment = await fetchEnrichment();
  return emitCloudRegions({
    provider: "gcp",
    metros,
    sourceUrl: URL,
    outFile: "cloud_regions.gcp.jsonl",
    enrichment,
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeGcp().catch((err) => {
    console.error("[gcp] fatal:", err);
    process.exit(1);
  });
}
