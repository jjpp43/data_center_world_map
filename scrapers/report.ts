import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OUT_DIR } from "./common/writer.ts";

interface Source {
  key: string;
  label: string;
  file: string;
  rejectedFile: string;
  type: "facility" | "region";
}

const SOURCES: Source[] = [
  { key: "peeringdb", label: "PeeringDB", file: "facilities.peeringdb.jsonl", rejectedFile: "rejected.peeringdb.jsonl", type: "facility" },
  { key: "osm", label: "OpenStreetMap", file: "facilities.osm.jsonl", rejectedFile: "rejected.osm.jsonl", type: "facility" },
  { key: "aws", label: "AWS", file: "cloud_regions.aws.jsonl", rejectedFile: "rejected.aws.jsonl", type: "region" },
  { key: "gcp", label: "GCP", file: "cloud_regions.gcp.jsonl", rejectedFile: "rejected.gcp.jsonl", type: "region" },
  { key: "azure", label: "Azure", file: "cloud_regions.azure.jsonl", rejectedFile: "rejected.azure.jsonl", type: "region" },
  { key: "oracle", label: "Oracle", file: "cloud_regions.oracle.jsonl", rejectedFile: "rejected.oracle.jsonl", type: "region" },
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

function pickCountries(records: unknown[], type: "facility" | "region"): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    const obj = r as Record<string, unknown>;
    let cc: unknown;
    if (type === "facility") {
      cc = (obj["location"] as Record<string, unknown> | undefined)?.["country"];
    } else {
      cc = obj["country"];
    }
    if (typeof cc === "string" && cc.length === 2) out.add(cc);
  }
  return out;
}

function sampleN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const out: T[] = [];
  // Deterministic sample using evenly spaced indices.
  const step = arr.length / n;
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(i * step);
    const item = arr[idx];
    if (item !== undefined) out.push(item);
  }
  return out;
}

function summarizeRejected(records: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const reason = (r as { _reason?: string })._reason ?? "(no reason)";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

export async function buildReport(failures: Array<{ source: string; error: string }> = []): Promise<void> {
  const lines: string[] = [];
  lines.push(`# Scrape Report`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  const allCountries = new Set<string>();
  lines.push(`## Counts per source`);
  lines.push("");
  lines.push(`| Source | Accepted | Rejected | Unique countries |`);
  lines.push(`|---|---:|---:|---:|`);

  const perSource: Record<string, { accepted: unknown[]; rejected: unknown[] }> = {};
  for (const s of SOURCES) {
    const accepted = await readJsonl(join(OUT_DIR, s.file));
    const rejected = await readJsonl(join(OUT_DIR, s.rejectedFile));
    perSource[s.key] = { accepted, rejected };
    const cc = pickCountries(accepted, s.type);
    cc.forEach((c) => allCountries.add(c));
    lines.push(`| ${s.label} | ${accepted.length} | ${rejected.length} | ${cc.size} |`);
  }
  lines.push("");
  lines.push(`**Total unique countries covered:** ${allCountries.size}`);
  lines.push("");

  if (failures.length > 0) {
    lines.push(`## Sources that failed entirely`);
    lines.push("");
    for (const f of failures) lines.push(`- **${f.source}**: ${f.error}`);
    lines.push("");
  }

  lines.push(`## Rejection reasons`);
  lines.push("");
  for (const s of SOURCES) {
    const data = perSource[s.key];
    if (!data || data.rejected.length === 0) continue;
    lines.push(`### ${s.label}`);
    const counts = summarizeRejected(data.rejected);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [reason, n] of sorted) {
      lines.push(`- \`${reason}\` — ${n}`);
    }
    lines.push("");
  }

  lines.push(`## Sample records`);
  lines.push("");
  for (const s of SOURCES) {
    const data = perSource[s.key];
    if (!data) continue;
    lines.push(`### ${s.label} (5 sample of ${data.accepted.length})`);
    lines.push("");
    lines.push("```json");
    for (const rec of sampleN(data.accepted, 5)) {
      lines.push(JSON.stringify(rec));
    }
    lines.push("```");
    lines.push("");
  }

  const path = join(OUT_DIR, "report.md");
  await writeFile(path, lines.join("\n"), "utf8");
  process.stderr.write(`[report] written to ${path}\n`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  buildReport().catch((err) => {
    console.error("[report] fatal:", err);
    process.exit(1);
  });
}
