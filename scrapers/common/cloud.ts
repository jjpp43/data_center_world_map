import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CloudRegion } from "./schema.ts";
import { round6, validateAll, writeJsonl, writeRejected } from "./writer.ts";

export interface MetroRow {
  name: string;
  city: string | null;
  country: string;
  lat: number;
  lng: number;
  launched_year?: number | null;
  az_count?: number | null;
}

export type MetroMap = Record<string, MetroRow>;

export async function loadMetros(file: string): Promise<MetroMap> {
  const path = join(process.cwd(), "data", file);
  const txt = await readFile(path, "utf8");
  return JSON.parse(txt) as MetroMap;
}

export interface EmitOpts {
  provider: "aws" | "gcp" | "azure" | "oracle";
  metros: MetroMap;
  sourceUrl: string;
  outFile: string;
  /** Optional per-code enrichment (e.g. az_count from scraped HTML) */
  enrichment?: Record<string, { az_count?: number | null; launched_year?: number | null }>;
}

export async function emitCloudRegions(opts: EmitOpts): Promise<{ accepted: number; rejected: number }> {
  const records: unknown[] = [];
  for (const [code, m] of Object.entries(opts.metros)) {
    const enr = opts.enrichment?.[code] ?? {};
    records.push({
      provider: opts.provider,
      code,
      name: m.name,
      city: m.city,
      country: m.country,
      lat: round6(m.lat),
      lng: round6(m.lng),
      az_count: enr.az_count ?? m.az_count ?? null,
      launched_year: enr.launched_year ?? m.launched_year ?? null,
      services: null,
      source_url: opts.sourceUrl,
    });
  }
  const { accepted, rejected } = validateAll(records, CloudRegion);
  await writeJsonl(opts.outFile, accepted);
  await writeRejected(opts.provider, rejected);
  process.stderr.write(
    `[${opts.provider}] done — accepted=${accepted.length} rejected=${rejected.length}\n`
  );
  return { accepted: accepted.length, rejected: rejected.length };
}
