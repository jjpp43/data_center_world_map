import { z } from "zod";
import { nowIso } from "./common/writer.ts";
import { paginate, validateRecords, writeRelJsonl, writeRelRejected } from "./peeringdb-rel-common.ts";

const API = "https://www.peeringdb.com/api/ixfac";

const Ixfac = z.object({
  fac_id: z.string().min(1),
  ix_id: z.string().min(1),
  status: z.literal("ok"),
  fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
});
type Ixfac = z.infer<typeof Ixfac>;

interface PdbIxfac {
  id: number;
  fac_id: number | null;
  ix_id: number | null;
  status?: string;
}

export async function scrapePeeringDbIxfac(): Promise<{ accepted: number; rejected: number }> {
  const fetchedAt = nowIso();
  const raw = await paginate<PdbIxfac>("ixfac", API, "peeringdb-ixfac");

  const mapped: unknown[] = [];
  for (const r of raw) {
    if (r.status !== "ok") continue;
    if (r.fac_id == null || r.ix_id == null) continue;
    mapped.push({
      fac_id: String(r.fac_id),
      ix_id: String(r.ix_id),
      status: "ok",
      fetched_at: fetchedAt,
    });
  }

  const { accepted, rejected } = validateRecords<Ixfac>(mapped, Ixfac);
  accepted.sort((a, b) => {
    const fa = Number(a.fac_id), fb = Number(b.fac_id);
    if (fa !== fb) return fa - fb;
    const xa = Number(a.ix_id), xb = Number(b.ix_id);
    return xa - xb;
  });

  await writeRelJsonl("peeringdb_ixfac.jsonl", accepted);
  await writeRelRejected("peeringdb_ixfac", rejected);

  process.stderr.write(`[peeringdb-ixfac] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapePeeringDbIxfac().catch((err) => {
    console.error("[peeringdb-ixfac] fatal:", err);
    process.exit(1);
  });
}
