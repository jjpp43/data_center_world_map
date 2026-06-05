import { z } from "zod";
import { nowIso } from "./common/writer.ts";
import { toCountryCode } from "./common/countries.ts";
import { paginate, validateRecords, writeRelJsonl, writeRelRejected } from "./peeringdb-rel-common.ts";

const API = "https://www.peeringdb.com/api/ix";

const Ix = z.object({
  ix_id: z.string().min(1),
  name: z.string().min(1),
  name_long: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  region_continent: z.string().nullable(),
  media: z.string().nullable(),
  proto_unicast: z.boolean().nullable(),
  proto_multicast: z.boolean().nullable(),
  proto_ipv6: z.boolean().nullable(),
  website: z.string().nullable(),
  url_stats: z.string().nullable(),
  tech_email: z.string().nullable(),
  policy_email: z.string().nullable(),
  net_count: z.number().int().nullable(),
  fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
});
type Ix = z.infer<typeof Ix>;

interface PdbIx {
  id: number;
  name: string | null;
  name_long?: string | null;
  city?: string | null;
  country?: string | null;
  region_continent?: string | null;
  media?: string | null;
  proto_unicast?: boolean | null;
  proto_multicast?: boolean | null;
  proto_ipv6?: boolean | null;
  website?: string | null;
  url_stats?: string | null;
  tech_email?: string | null;
  policy_email?: string | null;
  net_count?: number | null;
  status?: string;
}

function blank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function scrapePeeringDbIx(): Promise<{ accepted: number; rejected: number }> {
  const fetchedAt = nowIso();
  const raw = await paginate<PdbIx>("ix", API, "peeringdb-ix");

  const mapped: unknown[] = [];
  for (const r of raw) {
    if (r.status !== "ok") continue;
    if (r.id == null) continue;
    mapped.push({
      ix_id: String(r.id),
      name: blank(r.name) ?? "",
      name_long: blank(r.name_long),
      city: blank(r.city),
      country: toCountryCode(r.country ?? null),
      region_continent: blank(r.region_continent),
      media: blank(r.media),
      proto_unicast: r.proto_unicast ?? null,
      proto_multicast: r.proto_multicast ?? null,
      proto_ipv6: r.proto_ipv6 ?? null,
      website: blank(r.website),
      url_stats: blank(r.url_stats),
      tech_email: blank(r.tech_email),
      policy_email: blank(r.policy_email),
      net_count: typeof r.net_count === "number" ? r.net_count : null,
      fetched_at: fetchedAt,
    });
  }

  const { accepted, rejected } = validateRecords<Ix>(mapped, Ix);
  accepted.sort((a, b) => Number(a.ix_id) - Number(b.ix_id));

  await writeRelJsonl("peeringdb_ix.jsonl", accepted);
  await writeRelRejected("peeringdb_ix", rejected);

  process.stderr.write(`[peeringdb-ix] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapePeeringDbIx().catch((err) => {
    console.error("[peeringdb-ix] fatal:", err);
    process.exit(1);
  });
}
