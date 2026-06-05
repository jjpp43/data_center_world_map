import { scrapePeeringDb } from "./peeringdb.ts";
import { scrapeOsm } from "./osm.ts";
import { scrapeAws } from "./aws.ts";
import { scrapeGcp } from "./gcp.ts";
import { scrapeAzure } from "./azure.ts";
import { scrapeOracle } from "./oracle.ts";
import { buildReport } from "./report.ts";

interface RunSpec {
  name: string;
  run: () => Promise<unknown>;
}

const RUNS: RunSpec[] = [
  { name: "peeringdb", run: scrapePeeringDb },
  { name: "aws", run: scrapeAws },
  { name: "gcp", run: scrapeGcp },
  { name: "azure", run: scrapeAzure },
  { name: "oracle", run: scrapeOracle },
  { name: "osm", run: scrapeOsm },
];

async function main(): Promise<void> {
  const failures: Array<{ source: string; error: string }> = [];
  for (const spec of RUNS) {
    process.stderr.write(`\n========== ${spec.name} ==========\n`);
    try {
      await spec.run();
    } catch (err) {
      const msg = (err as Error).message || String(err);
      process.stderr.write(`[${spec.name}] FAILED: ${msg}\n`);
      failures.push({ source: spec.name, error: msg });
    }
  }
  process.stderr.write(`\n========== report ==========\n`);
  await buildReport(failures);
  if (failures.length > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error("[all] fatal:", err);
  process.exit(1);
});
