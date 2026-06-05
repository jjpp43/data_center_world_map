import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OUT_DIR } from "./common/writer.ts";
import { scrapePeeringDbIxfac } from "./peeringdb-ixfac.ts";
import { scrapePeeringDbIx } from "./peeringdb-ix.ts";
import { scrapePeeringDbNetfac } from "./peeringdb-netfac.ts";
import { scrapePeeringDbNet } from "./peeringdb-net.ts";

interface RunSpec {
  name: string;
  run: () => Promise<{ accepted: number; rejected: number }>;
}

// Small tables first, biggest last — gives us partial output even if the long
// netfac pull dies mid-run.
const RUNS: RunSpec[] = [
  { name: "peeringdb-ixfac", run: scrapePeeringDbIxfac },
  { name: "peeringdb-ix", run: scrapePeeringDbIx },
  { name: "peeringdb-netfac", run: scrapePeeringDbNetfac },
  { name: "peeringdb-net", run: scrapePeeringDbNet },
];

async function readJsonl(path: string): Promise<unknown[]> {
  try {
    await stat(path);
    const txt = await readFile(path, "utf8");
    return txt
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

interface FacRecord {
  name: string;
  operator: string | null;
  location?: { city?: string | null; country?: string | null };
  sources?: Array<{ source: string; source_id: string }>;
}

function buildFacIdIndex(facilities: unknown[]): Map<string, FacRecord> {
  const idx = new Map<string, FacRecord>();
  for (const f of facilities) {
    const obj = f as FacRecord;
    const src = obj.sources?.find((s) => s.source === "peeringdb");
    if (src?.source_id) idx.set(src.source_id, obj);
  }
  return idx;
}

function topNByCount<K>(items: K[], n: number): Array<{ key: K; count: number }> {
  const counts = new Map<K, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

async function appendReport(failures: Array<{ source: string; error: string }>): Promise<void> {
  const reportPath = join(OUT_DIR, "report.md");

  const netfac = await readJsonl(join(OUT_DIR, "peeringdb_netfac.jsonl"));
  const ixfac = await readJsonl(join(OUT_DIR, "peeringdb_ixfac.jsonl"));
  const net = await readJsonl(join(OUT_DIR, "peeringdb_net.jsonl"));
  const ix = await readJsonl(join(OUT_DIR, "peeringdb_ix.jsonl"));
  const facilities = await readJsonl(join(OUT_DIR, "facilities.peeringdb.jsonl"));

  const facIdx = buildFacIdIndex(facilities);
  const ixById = new Map<string, { name: string; name_long: string | null; city: string | null; country: string | null; net_count: number | null }>();
  for (const r of ix) {
    const o = r as { ix_id: string; name: string; name_long: string | null; city: string | null; country: string | null; net_count: number | null };
    ixById.set(o.ix_id, o);
  }

  const netfacFacIds = (netfac as Array<{ fac_id: string }>).map((r) => r.fac_id);
  const ixfacFacIds = (ixfac as Array<{ fac_id: string }>).map((r) => r.fac_id);
  const uniqueFacIds = new Set<string>([...netfacFacIds, ...ixfacFacIds]);

  const topFac = topNByCount(netfacFacIds, 20);
  const topIx = [...ix]
    .map((r) => r as { ix_id: string; name: string; city: string | null; country: string | null; net_count: number | null })
    .filter((r) => typeof r.net_count === "number")
    .sort((a, b) => (b.net_count ?? 0) - (a.net_count ?? 0))
    .slice(0, 20);

  const lines: string[] = [];
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## PeeringDB peering relationships");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("### Counts per file");
  lines.push("");
  lines.push("| File | Rows |");
  lines.push("|---|---:|");
  lines.push(`| peeringdb_ixfac.jsonl | ${ixfac.length} |`);
  lines.push(`| peeringdb_ix.jsonl | ${ix.length} |`);
  lines.push(`| peeringdb_netfac.jsonl | ${netfac.length} |`);
  lines.push(`| peeringdb_net.jsonl | ${net.length} |`);
  lines.push("");
  lines.push(`**Unique facility IDs covered (netfac ∪ ixfac):** ${uniqueFacIds.size}`);
  lines.push("");

  if (failures.length > 0) {
    lines.push("### Endpoints that failed entirely");
    lines.push("");
    for (const f of failures) lines.push(`- **${f.source}**: ${f.error}`);
    lines.push("");
  }

  lines.push("### Top 20 facilities by network count (from netfac)");
  lines.push("");
  lines.push("| # | fac_id | Facility | Operator | City | Country | Networks |");
  lines.push("|---:|---|---|---|---|---|---:|");
  topFac.forEach((row, i) => {
    const f = facIdx.get(row.key);
    const name = f?.name ?? "(unknown — not in facilities.peeringdb.jsonl)";
    const op = f?.operator ?? "";
    const city = f?.location?.city ?? "";
    const country = f?.location?.country ?? "";
    lines.push(`| ${i + 1} | ${row.key} | ${name} | ${op} | ${city} | ${country} | ${row.count} |`);
  });
  lines.push("");

  lines.push("### Top 20 IXPs by member count (net_count from /api/ix)");
  lines.push("");
  lines.push("| # | ix_id | IXP | City | Country | Members |");
  lines.push("|---:|---|---|---|---|---:|");
  topIx.forEach((row, i) => {
    lines.push(`| ${i + 1} | ${row.ix_id} | ${row.name} | ${row.city ?? ""} | ${row.country ?? ""} | ${row.net_count ?? 0} |`);
  });
  lines.push("");

  // Idempotent: strip any previously-appended PeeringDB-relations section so
  // re-runs leave a single, current report. The original facilities report
  // (generated by report.ts) is preserved untouched.
  const SECTION_MARKER = "## PeeringDB peering relationships";
  let existing = "";
  try {
    existing = await readFile(reportPath, "utf8");
  } catch {
    /* report.md may not exist yet — treat as empty */
  }
  const markerIdx = existing.indexOf(SECTION_MARKER);
  if (markerIdx !== -1) {
    // Walk back over the "---" separator and surrounding blank lines we added.
    let cut = markerIdx;
    while (cut > 0 && /[\s-]/.test(existing[cut - 1] ?? "")) cut--;
    existing = existing.slice(0, cut);
  }
  const trimmed = existing.replace(/\s+$/, "");
  const next = (trimmed.length > 0 ? trimmed + "\n" : "") + lines.join("\n");
  await writeFile(reportPath, next.endsWith("\n") ? next : next + "\n", "utf8");
  process.stderr.write(`[peeringdb-all] report section written to ${reportPath}\n`);
}

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
  await appendReport(failures);
  if (failures.length > 0) process.exitCode = 2;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[peeringdb-all] fatal:", err);
    process.exit(1);
  });
}
