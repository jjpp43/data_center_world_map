import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ZodSchema } from "zod";

export const OUT_DIR = join(process.cwd(), "out");

export interface ValidationResult<T> {
  accepted: T[];
  rejected: Array<{ record: unknown; reason: string }>;
}

/**
 * Validate every record against `schema`. Accepted records are sorted by `slug`
 * (facilities) or `code` (cloud regions). Rejected records include the failure
 * reason but never make it into the main output.
 */
export function validateAll<T extends { slug?: string; code?: string }>(
  records: unknown[],
  schema: ZodSchema<T>
): ValidationResult<T> {
  const accepted: T[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  for (const r of records) {
    const parsed = schema.safeParse(r);
    if (parsed.success) {
      accepted.push(parsed.data);
    } else {
      const reason = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      rejected.push({ record: r, reason });
    }
  }
  accepted.sort((a, b) => {
    const ka = a.slug ?? a.code ?? "";
    const kb = b.slug ?? b.code ?? "";
    return ka.localeCompare(kb);
  });
  return { accepted, rejected };
}

export async function writeJsonl(filename: string, records: unknown[]): Promise<void> {
  const path = join(OUT_DIR, filename);
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
  await writeFile(path, body, "utf8");
}

export async function writeRejected(
  source: string,
  rejected: Array<{ record: unknown; reason: string }>
): Promise<void> {
  if (rejected.length === 0) return;
  const path = join(OUT_DIR, `rejected.${source}.jsonl`);
  await mkdir(dirname(path), { recursive: true });
  const body =
    rejected
      .map((r) => {
        const rec =
          r.record && typeof r.record === "object" ? { ...(r.record as object) } : { value: r.record };
        return JSON.stringify({ ...rec, _reason: r.reason });
      })
      .join("\n") + "\n";
  await writeFile(path, body, "utf8");
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
