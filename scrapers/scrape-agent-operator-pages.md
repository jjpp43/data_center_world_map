# Data Center Scraping Agent — Brief (operator pages)

## Context

The original `../scrape-agent.md` brief covered location data (PeeringDB,
OpenStreetMap, cloud-provider region pages). The
`../scrape-agent-peering-relationships.md` brief covered the peering ecosystem
(networks, IXPs).

This brief covers the **third pillar of the dataset: physical / operational
specs** — the data that operators publish on their own facility pages but
that PeeringDB and OSM do not capture. Power capacity, square footage,
cabinet density, power redundancy topology, cooling, certifications, and
year built.

Output will be ingested into the same Postgres database as the other sources.
Each operator gets its own scraper module and its own JSONL output file. The
downstream ingester will match each record to an existing canonical
`data_centers` row (via operator+name or 100m proximity) and ENRICH the
canonical row's spec fields. It will also write a new `source_records` row
linking the operator's URL to that canonical.

Do **not** write to any database yourself.

## Output

Produce these files in `./out/`:

| File | Operator | Approx US count |
|---|---|---|
| `facilities.equinix.jsonl` | Equinix | ~95 (~268 global) |
| `facilities.digital-realty.jsonl` | Digital Realty | ~115 (~300 global) |
| `facilities.coresite.jsonl` | CoreSite | ~28 |
| `facilities.cyrusone.jsonl` | CyrusOne | ~45 |
| `facilities.qts.jsonl` | QTS Data Centers | ~35 |
| `facilities.cologix.jsonl` | Cologix | ~32 |
| `facilities.databank.jsonl` | DataBank | ~65 |
| `facilities.ironmountain.jsonl` | Iron Mountain | ~25 |

Append a "Operator pages" section to `out/report.md` with counts, missing
fields, and any operators that failed entirely.

**JSONL** = one JSON object per line, sorted by `slug` for deterministic diffs.

## Schema — enriched facility record

This extends the schema in `../scrape-agent.md`. All fields from the original
schema may appear; the new fields specific to operator scraping are marked
with **★** below. Anything the operator's page doesn't publish should be
`null`, not `"unknown"` or `""`.

```jsonc
{
  "slug": "equinix-ld8-london",        // REQUIRED, kebab-case
  "name": "Equinix LD8",               // REQUIRED — the operator's name for the facility
  "operator": "Equinix",               // REQUIRED — short brand name (not "Equinix, Inc.")
  "campus": "Equinix London Docklands",
  "code": "LD8",                       // ★ operator's facility code/abbreviation

  "location": {
    "address": "8-9 Harbour Exchange Square",
    "city": "London",
    "region": "England",
    "country": "GB",                   // ISO-3166-1 alpha-2
    "postal_code": "E14 9GE",
    "lat": 51.5012,                    // null if not on page (we'll fall back to dedup-by-name)
    "lng": -0.0167
  },

  "status": "operational",             // operational | under_construction | planned

  "specs": {
    "power_mw": 13,                    // total facility critical power, megawatts
    "power_redundancy": "2N",          // ★ "N+1" | "2N" | "2N+1" | etc, as text
    "space_sqft": 145000,              // total facility area
    "space_sqm": null,                 // sq m (set one; converter handles either)
    "raised_floor_sqft": 80000,        // ★ usable colo floor area, if disclosed separately
    "min_cabinet_density_kw": 5,       // ★ minimum kW per cabinet supported
    "max_cabinet_density_kw": 30,      // ★ maximum kW per cabinet supported
    "tier": "III",                     // Uptime Institute Tier (I|II|III|IV)
    "year_built": 2008,
    "year_opened": 2008,
    "cooling": "chilled water, N+1",   // free text, include redundancy if stated
    "cooling_redundancy": "N+1",       // ★ explicit redundancy designator if stated
    "pue": 1.4,

    "ups_redundancy": "N+1",           // ★ UPS topology
    "generator_redundancy": "N+1",     // ★ generator topology
    "generator_autonomy": "3 days",    // ★ free text — fuel runtime at full load
    "power_distribution": "230v / 400v", // ★ supply voltages
    "uptime_sla": "99.999%",           // ★ contractual uptime if published
    "building_description": "Purpose-built 2-storey tilt-up concrete",  // ★ free text
    "site_acres": 16                   // ★ campus land area (DataBank, others)
  },

  "connectivity": {
    "carriers_count": 47,              // ★ count if listed (we ingest individual carriers via PeeringDB)
    "ixps_count": 10,                  // ★ count if listed
    "meet_me_rooms": 2,                // ★ number of MMRs
    "cross_connects_count": 1200       // if disclosed
  },

  "certifications": ["SOC 2 Type II", "ISO 27001", "PCI-DSS", "HIPAA"],

  "security": {                        // ★ optional security feature flags
    "biometric": true,
    "mantrap": true,
    "ccvtv_24_7": true,
    "on_site_security": "24/7",
    "features": ["24x7 onsite security personnel", "CCTV with 90 day backup"]  // ★ raw bullets if extracted
  },

  "media": {
    "photos": [
      { "url": "https://...", "credit": "Equinix" }
    ],
    "website": "https://www.equinix.com/data-centers/.../ld8",  // the page we scraped
    "datasheet_url": "https://...pdf"  // ★ if linked from the facility page
  },

  "sources": [                         // REQUIRED, ≥1 entry
    {
      "source": "equinix-com",         // ★ NEW source key per operator (see list below)
      "source_id": "ld8",              // operator's facility code, lowercased
      "source_url": "https://www.equinix.com/data-centers/europe-colocation/united-kingdom-colocation/london-data-centers/ld8",
      "fetched_at": "2026-06-03T12:00:00Z",
      "raw": {
        // The full extracted spec block as you parsed it, before normalization.
        // Use this to recover from extraction bugs later without re-scraping.
      }
    }
  ]
}
```

### Source identifiers (new per-operator)

These must match exactly so the downstream ingester can route them:

| Operator | `source` key |
|---|---|
| Equinix | `equinix-com` |
| Digital Realty | `digitalrealty-com` |
| CoreSite | `coresite-com` |
| CyrusOne | `cyrusone-com` |
| QTS | `qtsdatacenters-com` |
| Cologix | `cologix-com` |
| DataBank | `databank-com` |
| Iron Mountain | `ironmountain-com` |

## Sources — per-operator scraping instructions

Process operators in the order listed. **Equinix and Digital Realty alone
cover ~210 US facilities** and have the most consistent templates — start
there.

For each operator: (1) crawl the operator's master location index page,
(2) extract the list of facility URLs, (3) fetch each facility page, (4)
parse the spec block, (5) emit one JSONL line per facility.

### 1. Equinix (priority — largest, most consistent)

- **Index URL**: `https://www.equinix.com/data-centers/americas-colocation/united-states-colocation` (and same pattern for other regions: `europe-colocation`, `asia-pacific-colocation`)
- **Per-facility URL pattern**: `https://www.equinix.com/data-centers/<region>-colocation/<country>-colocation/<city>-data-centers/<code>`
  - Example: `https://www.equinix.com/data-centers/americas-colocation/united-states-colocation/washington-dc-data-centers/dc1`
  - Example: `https://www.equinix.com/data-centers/europe-colocation/united-kingdom-colocation/london-data-centers/ld8`
- **Facility code**: `ld8`, `dc1`, `sg3`, etc. — the last URL segment
- **Spec block selector**: look for a section titled "Facility specifications" or "IBX overview". Equinix uses consistent labels:
  - "Total space" → `space_sqft`
  - "Available cabinets" → derive cabinet count
  - "Power" → `power_mw`
  - "Cabinet density" → `min/max_cabinet_density_kw` (often as a range "5–30 kW")
  - "Customer cross-connects" → `cross_connects_count`
  - "Carriers" / "Networks" → counts
  - "Certifications" → list
  - "Cooling system" → free text + redundancy
- **Lat/lng**: Equinix pages embed a map; coordinates are usually in a JSON-LD `<script type="application/ld+json">` block with `"geo": { "latitude": ..., "longitude": ... }`. Try that first.
- **Expected count**: ~268 facilities globally, ~95 in US

### 2. Digital Realty (priority)

- **Index URL**: `https://www.digitalrealty.com/data-centers`
- **Per-facility URL pattern**: `https://www.digitalrealty.com/data-centers/<region>/<city>/<code>`
  - Example: `https://www.digitalrealty.com/data-centers/americas/ashburn/iad17`
- **Facility code**: e.g. `iad17`, `lax12`, `lhr10`. URL slug.
- **Spec block**: Digital Realty publishes a "Facility highlights" or "Specifications" panel:
  - "Total power" → `power_mw`
  - "Total space" / "Gross sq ft" → `space_sqft`
  - "Net sq ft" / "Raised floor" → `raised_floor_sqft`
  - "Power density" → `min/max_cabinet_density_kw`
  - "Tier" → `tier`
  - "Year operational" → `year_built`
- **Lat/lng**: also in JSON-LD when available.
- **Expected count**: ~300 globally, ~115 in US

### 3. CoreSite (now American Tower)

- **Index URL**: `https://www.coresite.com/data-centers`
- **Per-facility URL pattern**: `https://www.coresite.com/data-centers/<market-name>/<code>`
  - Example: `https://www.coresite.com/data-centers/los-angeles/la1`
- **Spec block**: under "Data center overview" / "Facility specs":
  - "Total square footage" → `space_sqft`
  - "Critical IT load" → `power_mw`
  - "Cabinet density up to" → `max_cabinet_density_kw`
  - "Tier" → `tier`
- **Expected count**: ~28 facilities, all US

### 4. CyrusOne (now private — still publishes facility pages)

- **Index URL**: `https://cyrusone.com/data-center-locations/`
- **Per-facility URL**: navigate from index; URLs vary by market
- **Spec block**: "Property at a glance" panel:
  - "Total power" → `power_mw`
  - "Total space" → `space_sqft`
  - "Certifications" → list
- **Expected count**: ~50 globally, ~45 in US

### 5. QTS Data Centers (now Blackstone)

- **Index URL**: `https://www.qtsdatacenters.com/data-centers`
- **Per-facility URL pattern**: `https://www.qtsdatacenters.com/data-centers/<region>/<city>`
- **Spec block**: variable; look for "Megapower" / "Megacabinet" sections
- **Expected count**: ~35 US facilities

### 6. Cologix

- **Index URL**: `https://cologix.com/data-centers/`
- **Per-facility URL pattern**: `https://cologix.com/data-centers/<city>/<code>/`
- **Spec block**: "Specifications" tab on each facility page
- **Expected count**: ~32 N.A. facilities

### 7. DataBank

- **Index URL**: `https://www.databank.com/data-centers/`
- **Per-facility URL pattern**: `https://www.databank.com/data-centers/<city>-<code>/`
- **Expected count**: ~65 US facilities

### 8. Iron Mountain

- **Index URL**: `https://www.ironmountain.com/services/data-centers/data-center-locations`
- **Per-facility URL pattern**: `https://www.ironmountain.com/services/data-centers/data-center-locations/<region>/<code>`
- **Expected count**: ~25 US facilities

## Engineering rules

1. **One scraper module per operator** under `./scrapers/`:
   ```
   scrapers/equinix.ts
   scrapers/digital-realty.ts
   scrapers/coresite.ts
   ...
   ```
   Each runnable independently: `pnpm scrape:equinix`, `pnpm scrape:digital-realty`, etc.

2. **Two-pass crawl**:
   - **Pass 1**: hit the master index, collect facility URLs into `./cache/<op>/index.json`
   - **Pass 2**: for each URL, fetch + parse + emit one JSONL line. Cache the raw HTML under `./cache/<op>/<slug>.html` so re-runs don't re-hit.

3. **Idempotent**: sort output by `slug`. Re-runs should produce identical output (modulo `fetched_at`).

4. **Polite throttling**: max 1 request/sec per operator domain. Add jitter (±200ms). These are commercial sites; aggressive scraping will get you blocked.

5. **User-Agent**: `DataCenterMapBot/0.1 (+https://example.com/contact)`

6. **Retries**: 3× exponential backoff (2s, 5s, 10s) on 5xx or 403. On persistent 403, **stop and report** — don't bypass.

7. **Anti-bot reality**: Most operator sites are behind Cloudflare. Plain `undici`/`fetch` may get 403 on some. If so:
   - First try with a realistic browser UA and `Accept-Language: en-US,en;q=0.9`
   - If still blocked, fall back to Playwright (headless Chromium) for that operator only
   - Note in `out/report.md` which operators required Playwright

8. **Field extraction strategy**:
   - **Try JSON-LD first**. Operator pages frequently have `<script type="application/ld+json">` with `Place`/`Organization` types that include geo coordinates and address.
   - **Then try CSS selectors** for the spec table. Each operator's HTML is templated, so once you find the right selector for one facility on a domain, it works for the others.
   - **Last resort: regex on visible text**. Many spec values follow patterns like `"\\d+\\s*MW"`, `"\\d+,\\d+ sq ft"`, `"\\d+ kW per cabinet"`.

9. **Validation** (same as previous briefs):
   - Required fields: `name`, `operator`, `country`, `sources[0]`, `slug`
   - `lat`/`lng` either both present and within bounds, or both null
   - `power_mw`, `space_sqft`, etc. are numeric (parse "5.2 MW" → `5.2`)
   - Records failing validation → `./out/rejected.<operator>.jsonl` with `_reason`

10. **Slug**: keep deterministic. Formula: `slugify(${operator}-${code}-${city})`. Examples:
    - `equinix-ld8-london`
    - `digital-realty-iad17-ashburn`
    - `coresite-la1-los-angeles`

## Deliverables

1. One JSONL file per operator in `./out/`.
2. `out/report.md` — append a section "Operator pages" with:
   - Total facilities per operator
   - Average % field completeness (e.g. "Equinix: power_mw populated 78% / space_sqft 92% / tier 65%")
   - Per-operator note on whether Playwright was required
   - Sample 3 records per operator
3. Update `package.json` with `pnpm scrape:<operator>` for each + `pnpm scrape:operators-all` that runs them sequentially.
4. Update `README.md` with the new commands.

## Database target schema

The downstream ingester lands these JSONL records into Postgres. Spec fields
become typed columns on `data_centers` (see migration
`supabase/migrations/0005_operator_specs.sql`); the per-source URL + raw blob
go to `source_records`. Use the column names below as the canonical key set:

| JSONL path | DB column |
|---|---|
| `code` | `data_centers.code` |
| `specs.power_mw` | `power_mw` |
| `specs.power_redundancy` | `power_redundancy` |
| `specs.space_sqft` | `space_sqft` |
| `specs.space_sqm` | `space_sqm` |
| `specs.raised_floor_sqft` | `raised_floor_sqft` |
| `specs.min_cabinet_density_kw` | `min_cabinet_density_kw` |
| `specs.max_cabinet_density_kw` | `max_cabinet_density_kw` |
| `specs.tier` | `tier` (CHECK: I/II/III/IV/null — drop non-matching values) |
| `specs.year_built` | `year_built` |
| `specs.year_opened` | `year_opened` |
| `specs.cooling` | `cooling` |
| `specs.cooling_redundancy` | `cooling_redundancy` |
| `specs.pue` | `pue` |
| `specs.uptime_sla` | `uptime_sla` |
| `specs.generator_redundancy` | `generator_redundancy` |
| `specs.generator_autonomy` | `generator_autonomy` |
| `specs.ups_redundancy` | `ups_redundancy` |
| `specs.power_distribution` | `power_distribution` |
| `specs.building_description` | `building_description` |
| `specs.site_acres` | `site_acres` |
| `connectivity.carriers_count` | `carriers_count` |
| `connectivity.ixps_count` | `ixps_count` |
| `connectivity.meet_me_rooms` | `meet_me_rooms` |
| `connectivity.cross_connects_count` | `cross_connects_count` |
| `certifications` | `certifications` (jsonb) |
| `security` | `security` (jsonb) |
| `media.datasheet_url` | `datasheet_url` |
| `media.website` | `website` |
| `sources[]` | `source_records` rows (source key must match the allow-list — see below) |

Allowed `source_records.source` values (from migration 0005):
`peeringdb`, `aws`, `gcp`, `azure`, `oracle`, `osm`, `user`,
`equinix-com`, `digitalrealty-com`, `coresite-com`, `cyrusone-com`,
`qtsdatacenters-com`, `cologix-com`, `databank-com`, `ironmountain-com`.
Adding a new operator means a new migration that extends this CHECK.

The ingester matches by `(operator, name)` then by 100m proximity via
`match_data_center(...)`. Records with neither lat/lng nor a name match
against an existing canonical row are logged as orphans rather than
inserted — operator pages are an enrichment source, not a primary
location source.

## Out of scope

- Database writes
- Carriers list per facility (separate PeeringDB scraper handles this)
- Network/ASN lists (already covered by PeeringDB netfac)
- Photos beyond hero images
- Sustainability report parsing (separate effort)
- Operators with paywalled or login-gated facility pages (skip; note in report)
- Hyperscale providers' own buildings (AWS/Google/Microsoft/Meta) — they don't publish per-building specs

## Quality bar

Each operator's scraper should hit **≥80% field completeness** on at minimum:
- `name`, `operator`, `code`, `country`, `city`, `lat`, `lng`, `power_mw`, `space_sqft`

If less than 80% of facilities have these populated for a given operator, treat
the scraper as incomplete and note specific extraction problems in the report.
For optional fields (PUE, tier, cabinet density), best-effort is fine — many
operators don't publish them consistently.
