import { cachedFetch } from "./common/http.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { OUT_DIR } from "./common/writer.ts";
import type { ZodSchema } from "zod";

export const PAGE_SIZE = 250;
// PeeringDB's anonymous rate limit is stricter than its docs suggest — match
// the pacing of the existing facilities scraper (1500ms) to stay under quota
// across a single sequential run of all four endpoints.
export const DELAY_MS = 1500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface PdbPage<T> {
  data: T[];
}

/**
 * Paginate a PeeringDB collection endpoint, returning all raw rows.
 * Pages are cached under cache/peeringdb/<type>/.
 */
export async function paginate<T>(
  type: "netfac" | "ixfac" | "net" | "ix",
  baseUrl: string,
  tag: string,
): Promise<T[]> {
  const all: T[] = [];
  let skip = 0;
  let page = 0;
  process.stderr.write(`[${tag}] starting fetch from ${baseUrl}\n`);
  while (true) {
    const url = `${baseUrl}?limit=${PAGE_SIZE}&skip=${skip}`;
    const res = await cachedFetch(url, {
      cacheNamespace: `peeringdb/${type}`,
      cacheKey: `page_${page}`,
      headers: { accept: "application/json" },
    });
    const body = JSON.parse(res.body) as PdbPage<T>;
    const rows = body.data ?? [];
    page += 1;
    process.stderr.write(`[${tag}] page ${page} (skip=${skip}) — ${rows.length} rows${res.fromCache ? " [cache]" : ""}\n`);
    for (const r of rows) all.push(r);
    if (rows.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    if (!res.fromCache) await sleep(DELAY_MS);
  }
  return all;
}

export interface RelValidationResult<T> {
  accepted: T[];
  rejected: Array<{ record: unknown; reason: string }>;
}

export function validateRecords<T>(records: unknown[], schema: ZodSchema<T>): RelValidationResult<T> {
  const accepted: T[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  for (const r of records) {
    const p = schema.safeParse(r);
    if (p.success) accepted.push(p.data);
    else {
      const reason = p.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      rejected.push({ record: r, reason });
    }
  }
  return { accepted, rejected };
}

export async function writeRelJsonl(filename: string, records: unknown[]): Promise<void> {
  const path = join(OUT_DIR, filename);
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
  await writeFile(path, body, "utf8");
}

export async function writeRelRejected(
  source: string,
  rejected: Array<{ record: unknown; reason: string }>,
): Promise<void> {
  if (rejected.length === 0) return;
  const path = join(OUT_DIR, `rejected.${source}.jsonl`);
  await mkdir(dirname(path), { recursive: true });
  const body =
    rejected
      .map((r) => {
        const rec = r.record && typeof r.record === "object" ? { ...(r.record as object) } : { value: r.record };
        return JSON.stringify({ ...rec, _reason: r.reason });
      })
      .join("\n") + "\n";
  await writeFile(path, body, "utf8");
}
