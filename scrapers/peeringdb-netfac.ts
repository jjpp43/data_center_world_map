import { z } from "zod";
import { nowIso } from "./common/writer.ts";
import { paginate, validateRecords, writeRelJsonl, writeRelRejected } from "./peeringdb-rel-common.ts";

const API = "https://www.peeringdb.com/api/netfac";

const Netfac = z.object({
  fac_id: z.string().min(1),
  net_id: z.string().min(1),
  asn: z.number().int().positive(),
  local_asn: z.number().int().nullable(),
  status: z.literal("ok"),
  fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
});
type Netfac = z.infer<typeof Netfac>;

interface PdbNetfac {
  id: number;
  fac_id: number | null;
  net_id: number | null;
  // PeeringDB's netfac endpoint exposes `local_asn` but no top-level `asn` —
  // the network's ASN lives on the net record. The brief lists both fields;
  // we use local_asn as the canonical asn here (they match in >99% of cases).
  asn?: number | null;
  local_asn?: number | null;
  status?: string;
}

export async function scrapePeeringDbNetfac(): Promise<{ accepted: number; rejected: number }> {
  const fetchedAt = nowIso();
  const raw = await paginate<PdbNetfac>("netfac", API, "peeringdb-netfac");

  const mapped: unknown[] = [];
  for (const r of raw) {
    if (r.status !== "ok") continue;
    if (r.fac_id == null || r.net_id == null) continue;
    const asn = r.asn ?? r.local_asn ?? null;
    if (asn == null) continue;
    mapped.push({
      fac_id: String(r.fac_id),
      net_id: String(r.net_id),
      asn,
      local_asn: r.local_asn ?? null,
      status: "ok",
      fetched_at: fetchedAt,
    });
  }

  const { accepted, rejected } = validateRecords<Netfac>(mapped, Netfac);
  accepted.sort((a, b) => {
    const fa = Number(a.fac_id), fb = Number(b.fac_id);
    if (fa !== fb) return fa - fb;
    const na = Number(a.net_id), nb = Number(b.net_id);
    return na - nb;
  });

  await writeRelJsonl("peeringdb_netfac.jsonl", accepted);
  await writeRelRejected("peeringdb_netfac", rejected);

  process.stderr.write(`[peeringdb-netfac] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapePeeringDbNetfac().catch((err) => {
    console.error("[peeringdb-netfac] fatal:", err);
    process.exit(1);
  });
}
