# Data Center Scraping Agent — Brief (extension)

## Context

The original brief (`scrape-agent.md`) was for facility *locations*. This
extension adds **peering ecosystem density** — for every facility we already
have, which networks (ASNs) are present in the building and which Internet
Exchange Points (IXPs) operate there. Both come from the same PeeringDB API
you already integrated; you do **not** need to re-scrape facilities.

The output will be ingested into a Postgres database (`networks_at_facility`
and `ixes_at_facility` tables) and surfaced on per-facility detail pages.
Do **not** attempt to write to any database yourself.

## Output

Produce these files in `./out/`:

| File | Contents |
|---|---|
| `peeringdb_netfac.jsonl` | One JSON object per (network, facility) pair |
| `peeringdb_ixfac.jsonl` | One JSON object per (IXP, facility) pair |
| `peeringdb_net.jsonl` | One JSON object per network (enrichment lookup) |
| `peeringdb_ix.jsonl` | One JSON object per IXP (enrichment lookup) |

Also append a section to `out/report.md` with counts and any anomalies.

## Schema — `peeringdb_netfac.jsonl`

One row per (network, facility) presence relationship. PeeringDB calls this
the "netfac" join.

```jsonc
{
  "fac_id": "45",         // REQUIRED. PeeringDB facility ID, as string.
                          //   Joins to source_records.source_id where source='peeringdb'.
  "net_id": "112",        // REQUIRED. PeeringDB network ID, as string.
  "asn": 174,             // REQUIRED. Autonomous system number.
  "local_asn": 174,       // Sometimes differs from asn; preserve both.
  "status": "ok",         // PeeringDB status; only emit "ok" rows.
  "fetched_at": "2026-06-03T12:00:00Z"
}
```

- **Endpoint**: `https://www.peeringdb.com/api/netfac`
- **Auth**: none required for read
- **Format**: JSON, paginated via `?limit=250&skip=0` (max limit 250)
- **Expected count**: ~80,000–100,000 rows
- **Rate limit**: ~50 req/min anon. Add 200ms between page requests.

Drop any row where `status != "ok"` or `fac_id`/`net_id` is null.

## Schema — `peeringdb_ixfac.jsonl`

One row per (IXP, facility) relationship.

```jsonc
{
  "fac_id": "45",         // REQUIRED. PeeringDB facility ID, as string.
  "ix_id": "26",          // REQUIRED. PeeringDB IX ID, as string.
  "status": "ok",
  "fetched_at": "2026-06-03T12:00:00Z"
}
```

- **Endpoint**: `https://www.peeringdb.com/api/ixfac`
- **Expected count**: ~3,000–5,000 rows
- Drop non-"ok" rows.

## Schema — `peeringdb_net.jsonl` (enrichment lookup)

One row per network. Used to display network metadata on the detail page
without having to join through facilities at render time.

```jsonc
{
  "net_id": "112",                    // REQUIRED. PeeringDB network ID, as string.
  "asn": 174,                          // REQUIRED.
  "name": "Cogent Communications",     // REQUIRED.
  "aka": "Cogent",                     // optional alternate name
  "name_long": "Cogent Communications, Inc.",
  "website": "https://www.cogentco.com/",
  "info_type": "NSP",                  // NSP|Cable|Content|Educational|Enterprise|...
  "info_scope": "Global",
  "info_traffic": "100-1000Gbps",      // self-reported
  "info_ratio": "Balanced",
  "info_unicast": true,
  "info_multicast": false,
  "info_ipv6": true,
  "policy_general": "Open",            // Open|Selective|Restrictive|No
  "policy_url": "https://...",
  "irr_as_set": "AS-COGENT",
  "fetched_at": "2026-06-03T12:00:00Z"
}
```

- **Endpoint**: `https://www.peeringdb.com/api/net`
- **Expected count**: ~30,000 rows
- Drop rows where `status != "ok"`.

## Schema — `peeringdb_ix.jsonl` (enrichment lookup)

One row per Internet Exchange Point.

```jsonc
{
  "ix_id": "26",                       // REQUIRED. PeeringDB IX ID, as string.
  "name": "LINX LON1",                 // REQUIRED.
  "name_long": "London Internet Exchange, LON1",
  "city": "London",
  "country": "GB",                     // ISO-3166-1 alpha-2 uppercase
  "region_continent": "Europe",
  "media": "Ethernet",
  "proto_unicast": true,
  "proto_multicast": false,
  "proto_ipv6": true,
  "website": "https://www.linx.net/",
  "url_stats": "https://www.linx.net/...",
  "tech_email": null,
  "policy_email": null,
  "net_count": 920,                    // member networks
  "fetched_at": "2026-06-03T12:00:00Z"
}
```

- **Endpoint**: `https://www.peeringdb.com/api/ix`
- **Expected count**: ~1,200 rows
- Drop non-"ok" rows.

## Engineering rules (same as original brief)

1. **Idempotent.** Sort each file by `(fac_id, net_id)` or `(fac_id, ix_id)` or by `net_id` / `ix_id` so re-runs produce identical diffs.
2. **Cache HTTP responses** under `./cache/peeringdb/{netfac|ixfac|net|ix}/page_{N}.json` so a crash mid-run doesn't re-hit the server.
3. **Retries**: 3× exponential backoff (1s, 2s, 4s) on 5xx.
4. **User-Agent**: `DataCenterMapBot/0.1 (+https://example.com/contact)`.
5. **Validation**: required fields present, IDs are non-empty strings (stringify upstream integers), `asn` is a positive integer for net records. Reject rows that fail validation to `./out/rejected.peeringdb_{type}.jsonl` with a `_reason` field.
6. **No JS execution** needed — plain HTTP + JSON parser.

## Cross-source consistency

PeeringDB facility IDs are integers in the API. **Stringify them** in `fac_id`
so they match `source_records.source_id` in our database (we already store
PeeringDB IDs as strings there).

The relationships only matter for facilities we've already ingested from
PeeringDB. If a `netfac` or `ixfac` row references a `fac_id` whose facility
hasn't been seen in our previous `facilities.peeringdb.jsonl` run, that's fine
— emit it anyway; the downstream ingester will skip it.

## Scripts (add to `package.json`)

Match the convention from the original brief:

```jsonc
{
  "scripts": {
    "scrape:peeringdb-netfac": "tsx peeringdb-netfac.ts",
    "scrape:peeringdb-ixfac":  "tsx peeringdb-ixfac.ts",
    "scrape:peeringdb-net":    "tsx peeringdb-net.ts",
    "scrape:peeringdb-ix":     "tsx peeringdb-ix.ts",
    "scrape:peeringdb-all":    "tsx peeringdb-all.ts"
  }
}
```

The `peeringdb-all.ts` orchestrator runs all four sequentially in the order
listed above (ixfac, ix, netfac, net — small tables first, biggest last).

## Report additions

Append to `out/report.md`:

- Total rows produced per file
- Total unique facility IDs covered
- Top 20 facilities by network count (signals which buildings are the densest interconnect hubs — sanity check; Equinix Ashburn DC2, Equinix LD8, AMS-IX members, etc. should be at the top)
- Top 20 IXPs by member count (LINX LON1, DE-CIX Frankfurt, AMS-IX should top this)
- Anything that failed entirely

## Out of scope (do NOT do)

- Database writes
- Re-scraping facilities (use the existing `facilities.peeringdb.jsonl`)
- Network-to-network peering relationships (PeeringDB has `/api/netixlan` for this; we don't need it yet)
- Carriers (PeeringDB has `/api/carrier` and `/api/carrierfac`; could add later as a third dataset, but not in this brief)
- Photos, footprints, anything visual
