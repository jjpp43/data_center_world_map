import { cachedFetch } from "./common/http.ts";
import { emitCloudRegions, loadMetros } from "./common/cloud.ts";

const URL = "https://datacenters.microsoft.com/globe/explore";
const BACKUP_URL = "https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/";

/**
 * Touch the Azure pages so the run reflects an actual fetch attempt
 * (cached on disk for idempotency). The pages are heavily JS-driven, so
 * we don't attempt to parse them — coordinates and metadata come from
 * the curated data/azure_metros.json file. If the fetch fails we log
 * and continue.
 */
async function touchSourcePages(): Promise<void> {
  for (const [ns, url] of [
    ["azure-main", URL],
    ["azure-backup", BACKUP_URL],
  ] as const) {
    try {
      await cachedFetch(url, { cacheNamespace: "azure", cacheKey: ns, maxRetries: 1 });
    } catch (err) {
      process.stderr.write(`[azure] could not fetch ${url}: ${(err as Error).message}\n`);
    }
  }
}

export async function scrapeAzure(): Promise<{ accepted: number; rejected: number }> {
  const metros = await loadMetros("azure_metros.json");
  await touchSourcePages();
  return emitCloudRegions({
    provider: "azure",
    metros,
    sourceUrl: URL,
    outFile: "cloud_regions.azure.jsonl",
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeAzure().catch((err) => {
    console.error("[azure] fatal:", err);
    process.exit(1);
  });
}
