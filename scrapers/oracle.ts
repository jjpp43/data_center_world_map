import { cachedFetch } from "./common/http.ts";
import { emitCloudRegions, loadMetros } from "./common/cloud.ts";

const URL = "https://www.oracle.com/cloud/public-cloud-regions/";

async function touchSourcePage(): Promise<void> {
  try {
    await cachedFetch(URL, { cacheNamespace: "oracle", cacheKey: "regions-html", maxRetries: 1 });
  } catch (err) {
    process.stderr.write(`[oracle] could not fetch ${URL}: ${(err as Error).message}\n`);
  }
}

export async function scrapeOracle(): Promise<{ accepted: number; rejected: number }> {
  const metros = await loadMetros("oracle_metros.json");
  await touchSourcePage();
  return emitCloudRegions({
    provider: "oracle",
    metros,
    sourceUrl: URL,
    outFile: "cloud_regions.oracle.jsonl",
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeOracle().catch((err) => {
    console.error("[oracle] fatal:", err);
    process.exit(1);
  });
}
