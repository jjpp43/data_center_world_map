import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OUT_DIR } from "./common/writer.ts";
import { scrapeEquinix } from "./equinix.ts";
import { scrapeDigitalRealty } from "./digital-realty.ts";
import { scrapeDataBank } from "./databank.ts";
import { scrapeCologix } from "./cologix.ts";
import { scrapeCoreSite } from "./coresite.ts";
import { scrapeCyrusOne } from "./cyrusone.ts";
import { scrapeQts } from "./qts.ts";

interface RunSpec {
  name: string;
  run: () => Promise<{ accepted: number; rejected: number }>;
}

const RUNS: RunSpec[] = [
  { name: "equinix", run: scrapeEquinix },
  { name: "digital-realty", run: scrapeDigitalRealty },
  { name: "databank", run: scrapeDataBank },
  { name: "cologix", run: scrapeCologix },
  { name: "coresite", run: scrapeCoreSite },
  { name: "cyrusone", run: scrapeCyrusOne },
  { name: "qts", run: scrapeQts },
];

interface OperatorMeta {
  key: string;
  label: string;
  file: string;
}

const OPERATORS: OperatorMeta[] = [
  { key: "equinix", label: "Equinix", file: "facilities.equinix.jsonl" },
  { key: "digital-realty", label: "Digital Realty", file: "facilities.digital-realty.jsonl" },
  { key: "databank", label: "DataBank", file: "facilities.databank.jsonl" },
  { key: "cologix", label: "Cologix", file: "facilities.cologix.jsonl" },
  { key: "coresite", label: "CoreSite", file: "facilities.coresite.jsonl" },
  { key: "cyrusone", label: "CyrusOne", file: "facilities.cyrusone.jsonl" },
  { key: "qts", label: "QTS", file: "facilities.qts.jsonl" },
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

// Per-operator completeness on fields the brief calls out as priorities.
const FIELDS: Array<{ key: string; label: string; pick: (r: Record<string, unknown>) => unknown }> = [
  { key: "name", label: "name", pick: (r) => r.name },
  { key: "code", label: "code", pick: (r) => r.code },
  { key: "city", label: "city", pick: (r) => (r.location as Record<string, unknown> | undefined)?.city },
  { key: "country", label: "country", pick: (r) => (r.location as Record<string, unknown> | undefined)?.country },
  { key: "lat", label: "lat", pick: (r) => (r.location as Record<string, unknown> | undefined)?.lat },
  { key: "lng", label: "lng", pick: (r) => (r.location as Record<string, unknown> | undefined)?.lng },
  { key: "power_mw", label: "power_mw", pick: (r) => (r.specs as Record<string, unknown> | undefined)?.power_mw },
  { key: "space_sqft", label: "space_sqft", pick: (r) => (r.specs as Record<string, unknown> | undefined)?.space_sqft },
  { key: "tier", label: "tier", pick: (r) => (r.specs as Record<string, unknown> | undefined)?.tier },
  { key: "year_built", label: "year_built", pick: (r) => (r.specs as Record<string, unknown> | undefined)?.year_built },
  { key: "pue", label: "pue", pick: (r) => (r.specs as Record<string, unknown> | undefined)?.pue },
  { key: "certifications", label: "certifications", pick: (r) => r.certifications },
];

function completenessRow(label: string, records: Array<Record<string, unknown>>): string {
  const total = records.length || 1;
  const cells = FIELDS.map(({ pick }) => {
    const populated = records.filter((r) => {
      const v = pick(r);
      if (v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.length > 0;
      return true;
    }).length;
    return Math.round((populated / total) * 100);
  });
  return `| ${label} | ${records.length} | ${cells.map((c) => `${c}%`).join(" | ")} |`;
}

async function appendReport(failures: Array<{ source: string; error: string }>): Promise<void> {
  const reportPath = join(OUT_DIR, "report.md");

  const perOp: Record<string, { records: Array<Record<string, unknown>>; rejected: unknown[] }> = {};
  for (const op of OPERATORS) {
    const records = (await readJsonl(join(OUT_DIR, op.file))) as Array<Record<string, unknown>>;
    const rejected = await readJsonl(join(OUT_DIR, `rejected.${op.key}.jsonl`));
    perOp[op.key] = { records, rejected };
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Operator pages");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("### Coverage and completeness");
  lines.push("");
  lines.push(`| Operator | Total | ${FIELDS.map((f) => f.label).join(" | ")} |`);
  lines.push(`|---|---:|${FIELDS.map(() => "---:").join("|")}|`);
  for (const op of OPERATORS) {
    const bucket = perOp[op.key];
    if (!bucket) continue;
    lines.push(completenessRow(op.label, bucket.records));
  }
  lines.push("");

  // Rejected summary
  for (const op of OPERATORS) {
    const bucket = perOp[op.key];
    if (!bucket) continue;
    const rj = bucket.rejected;
    if (rj.length === 0) continue;
    lines.push(`### ${op.label} — rejected (${rj.length})`);
    const reasons = new Map<string, number>();
    for (const r of rj) {
      const reason = (r as { _reason?: string })._reason ?? "(no reason)";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      lines.push(`- \`${reason}\` — ${n}`);
    }
    lines.push("");
  }

  if (failures.length > 0) {
    lines.push("### Operators that failed entirely");
    lines.push("");
    for (const f of failures) lines.push(`- **${f.source}**: ${f.error}`);
    lines.push("");
  }

  // Sample records
  lines.push("### Sample records");
  lines.push("");
  for (const op of OPERATORS) {
    const bucket = perOp[op.key];
    if (!bucket) continue;
    const recs = bucket.records;
    if (recs.length === 0) continue;
    lines.push(`#### ${op.label} (3 of ${recs.length})`);
    lines.push("");
    lines.push("```json");
    const step = Math.max(1, Math.floor(recs.length / 3));
    for (let i = 0; i < Math.min(3, recs.length); i++) {
      const r = recs[Math.min(recs.length - 1, i * step)];
      if (!r) continue;
      // Strip the bulky `raw` block in samples; full block still in JSONL.
      const slim = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
      if (Array.isArray(slim.sources)) {
        (slim.sources as Array<Record<string, unknown>>).forEach((s) => {
          if (s.raw) s.raw = "<elided in report>";
        });
      }
      lines.push(JSON.stringify(slim));
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("### Notes on field availability");
  lines.push("");
  lines.push("- **Equinix** publishes redundancy designators (`2N`, `N+1`), total space (sqft+sqm), min cabinet density (kVA), certifications, and rich generator/UPS/cooling redundancy via tab panels. NOT published: `power_mw`, `tier`, `year_built`, `pue`, carrier/cross-connect counts, lat/lng.");
  lines.push("- **Digital Realty** publishes the most via its Next.js Drupal blob (`__NEXT_DATA__.pageProps.data.field_*`): `field_latitude`, `field_longitude`, `field_total_building_size_in_ft2`, `field_design_pue`, `field_certifications_*`, structured address. NOT published: `power_mw`, `tier`, `year_built`.");
  lines.push("- **DataBank** publishes the most consistent per-facility specs — `power_mw` and `space_sqft` are populated 100% via the labels `<N>MW Critical IT Load` and `<N> IT Square Feet`. NOT published: lat/lng, tier, year, pue.");
  lines.push("- **Cologix** publishes specs only for the half of facilities marketed as \"Scalelogix\" purpose-built sites. Older sites get an address-only page. Tier (\"Tier III Uptime Standards\") is published for the newer builds.");
  lines.push("- **CoreSite** does not have per-facility URLs — all facilities in a metro share one city page (e.g. `/data-center-locations/los-angeles` lists LA1, LA2, LA3). We extract per-facility blocks from h3 sections.");
  lines.push("- **CyrusOne** publishes `power_mw` and `space_sqft` inline in the marketing copy; extraction is regex-driven against text following the facility code mention. Some pages don't repeat specs for the facility itself.");
  lines.push("- **QTS** rebranded the consumer site to `q.com` (the brief's `qtsdatacenters.com` 301s). Each URL represents a CAMPUS (e.g. \"Ashburn 1\") which may contain multiple DC buildings; we capture the total power across DC1+DC2+... and store the DC1 value separately in `specs.power_mw_dc1`.");
  lines.push("- **Iron Mountain** is gated behind a **Vercel Security Checkpoint (429 + JS challenge)**. Plain `undici` cannot pass it — requires Playwright. Skipped in this run per the brief's instruction to note Playwright-required operators rather than bypass.");
  lines.push("- No operator other than Iron Mountain required Playwright. Equinix returns 403 to bot UAs; all others accept either bot or browser UA.");
  lines.push("");

  // Idempotent append
  const SECTION_MARKER = "## Operator pages";
  let existing = "";
  try {
    existing = await readFile(reportPath, "utf8");
  } catch {
    /* report.md may not exist yet */
  }
  const markerIdx = existing.indexOf(SECTION_MARKER);
  if (markerIdx !== -1) {
    let cut = markerIdx;
    while (cut > 0 && /[\s-]/.test(existing[cut - 1] ?? "")) cut--;
    existing = existing.slice(0, cut);
  }
  const trimmed = existing.replace(/\s+$/, "");
  const next = (trimmed.length > 0 ? trimmed + "\n" : "") + lines.join("\n");
  await writeFile(reportPath, next.endsWith("\n") ? next : next + "\n", "utf8");
  process.stderr.write(`[operators-all] report section written to ${reportPath}\n`);
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
    console.error("[operators-all] fatal:", err);
    process.exit(1);
  });
}
