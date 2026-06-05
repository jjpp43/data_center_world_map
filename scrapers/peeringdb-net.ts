import { z } from "zod";
import { nowIso } from "./common/writer.ts";
import { paginate, validateRecords, writeRelJsonl, writeRelRejected } from "./peeringdb-rel-common.ts";

const API = "https://www.peeringdb.com/api/net";

const Net = z.object({
  net_id: z.string().min(1),
  asn: z.number().int().positive(),
  name: z.string().min(1),
  aka: z.string().nullable(),
  name_long: z.string().nullable(),
  website: z.string().nullable(),
  info_type: z.string().nullable(),
  info_scope: z.string().nullable(),
  info_traffic: z.string().nullable(),
  info_ratio: z.string().nullable(),
  info_unicast: z.boolean().nullable(),
  info_multicast: z.boolean().nullable(),
  info_ipv6: z.boolean().nullable(),
  policy_general: z.string().nullable(),
  policy_url: z.string().nullable(),
  irr_as_set: z.string().nullable(),
  fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
});
type Net = z.infer<typeof Net>;

interface PdbNet {
  id: number;
  asn: number;
  name: string | null;
  aka?: string | null;
  name_long?: string | null;
  website?: string | null;
  info_type?: string | null;
  info_scope?: string | null;
  info_traffic?: string | null;
  info_ratio?: string | null;
  info_unicast?: boolean | null;
  info_multicast?: boolean | null;
  info_ipv6?: boolean | null;
  policy_general?: string | null;
  policy_url?: string | null;
  irr_as_set?: string | null;
  status?: string;
}

function blank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function scrapePeeringDbNet(): Promise<{ accepted: number; rejected: number }> {
  const fetchedAt = nowIso();
  const raw = await paginate<PdbNet>("net", API, "peeringdb-net");

  const mapped: unknown[] = [];
  for (const r of raw) {
    if (r.status !== "ok") continue;
    if (r.id == null) continue;
    mapped.push({
      net_id: String(r.id),
      asn: r.asn,
      name: blank(r.name) ?? "",
      aka: blank(r.aka),
      name_long: blank(r.name_long),
      website: blank(r.website),
      info_type: blank(r.info_type),
      info_scope: blank(r.info_scope),
      info_traffic: blank(r.info_traffic),
      info_ratio: blank(r.info_ratio),
      info_unicast: r.info_unicast ?? null,
      info_multicast: r.info_multicast ?? null,
      info_ipv6: r.info_ipv6 ?? null,
      policy_general: blank(r.policy_general),
      policy_url: blank(r.policy_url),
      irr_as_set: blank(r.irr_as_set),
      fetched_at: fetchedAt,
    });
  }

  const { accepted, rejected } = validateRecords<Net>(mapped, Net);
  accepted.sort((a, b) => Number(a.net_id) - Number(b.net_id));

  await writeRelJsonl("peeringdb_net.jsonl", accepted);
  await writeRelRejected("peeringdb_net", rejected);

  process.stderr.write(`[peeringdb-net] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapePeeringDbNet().catch((err) => {
    console.error("[peeringdb-net] fatal:", err);
    process.exit(1);
  });
}
