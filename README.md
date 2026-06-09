# datacenters.world

An open, sourced atlas of every serious data center on Earth.

**Live:** _coming soon_

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20PostGIS-3ECF8E)](https://supabase.com/)
[![Mapbox](https://img.shields.io/badge/Mapbox-GL%20JS-2c3e50)](https://www.mapbox.com/)

## At a glance

| | |
|---|---:|
| Data centers | **5,351** |
| Countries | **148** |
| Networks (ASNs) | **34,732** |
| Internet exchanges | **1,309** |
| Cloud regions | **176** |
| Operator-page records (7 colos) | **714** |
| Indexable URLs in sitemap | **6,153** |
| JSON-LD schemas per facility | **Place + FAQPage** |

```
Coverage by country (top 8)
─────────────────────────────────────────
US  ████████████████████  1,372
DE  █████                   359
GB  ████                    282
FR  ███                     213
NL  ██                      189
JP  ██                      167
SG  ██                      133
AU  █                        98
```

## Why it exists

Public directories disagree about what counts as a data center by a factor of three. We pick a deliberate inclusion criterion (≥ 500 kW, distinct named facility, documented source) and build under that scope — smaller than DataCenterMap, more rigorous, with the methodology [published openly](https://datacenters.world/methodology).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server components for SEO-indexed detail pages, client for the map |
| Language | TypeScript 5 | Strict mode across app + scrapers |
| Database | Supabase Postgres + PostGIS | `ST_DWithin` for spatial dedup, RLS for security |
| Map | Mapbox GL JS 3.8+ | 2D ↔ 3D globe, native clustering, theme-aware styles |
| Styling | Tailwind v4 | Custom design tokens, cookie-persisted dark/light |
| Scraping | Node 22 + `undici` (+ Playwright fallback) | Separate subproject under `scrapers/` |
| Hosting | Vercel | Edge CDN, `s-maxage=3600, stale-while-revalidate=86400` |

## Data pipeline

```
External sources                Scrapers              JSONL                 Postgres
────────────────                ────────              ─────                 ────────
PeeringDB API           ───►    peeringdb.ts    ───►  facilities.peeringdb  data_centers
OpenStreetMap           ───►    osm.ts          ───►  facilities.osm        source_records
AWS/GCP/Azure/Oracle    ───►    {provider}.ts   ───►  cloud_regions.*       cloud_regions
7 operator websites     ───►    {operator}.ts   ───►  facilities.{op}       networks
PeeringDB net/ix/fac    ───►    peeringdb-*.ts  ───►  peeringdb_*           ixes
                                                                            networks_at_facility
                                                                            ixes_at_facility
                                              │
                                              ▼  npm run ingest (idempotent)
                                       scripts/ingest.ts
                                              │
                                              ▼
                                       Next.js app
                                              │
                                              ▼
                                       Vercel edge
```

Each scraper produces sorted-by-slug JSONL. `npm run ingest` reads every file in order, matches against existing canonical rows via `match_data_center()`, and upserts. Re-runs produce identical state.

## How we aggregate

### Three pillars, ingested in order

**1. Location & identity** — PeeringDB seeds 5,256 canonical rows; OSM adds 95 net-new after deduplicating 115 against PeeringDB via the match function.

**2. Spec enrichment** — Seven operator websites scraped for power, space, cabinet density, UPS topology, certifications. Matched back to canonical rows; the orphans get logged for review.

**3. Interconnect graph** — PeeringDB's `/net`, `/ix`, `/netfac`, `/ixfac` ingested as M:N relations. The `networks_at_facility` count (57,206 rows) is what makes the map's dense hubs glow brighter than small ones.

### The dedup matcher

Every cross-source ingest runs through three stages before deciding to insert:

```
For each incoming record:

  Stage 1 ─ match_data_center(operator, name, lat, lng, 100m)
            │
            ├─ hit  → enrich existing canonical
            └─ miss
                │
                ▼
  Stage 2 ─ operator ILIKE 'X%' AND name ILIKE 'Y%'
            │
            ├─ hit  → enrich (handles "Equinix" → "Equinix, Inc.",
            │        "Equinix LD8" → "Equinix LD8 - London")
            └─ miss
                │
                ▼
  Stage 3 ─ operator ILIKE 'X%' AND name ~* '\m<CODE>\M'
            │
            ├─ hit  → enrich (handles "(AT1)" inside
            │        "CoreSite - Atlanta (AT1)")
            └─ miss → log to orphans.jsonl
```

### Operator-page match rates

```
Operator         Scraped   Matched (▓ = matched, ░ = orphan)
────────────────────────────────────────────────────────────────
CoreSite          24        ████████████████████░  96%   23
Cologix           48        ███████████████████░░  90%   43
Equinix          227        █████████████████░░░░  81%  183
DataBank          76        ████████████████░░░░░  80%   61
Digital Realty   240        █████████████░░░░░░░░  67%  161
QTS               48        ████░░░░░░░░░░░░░░░░░  19%    9
CyrusOne          51        ░░░░░░░░░░░░░░░░░░░░░   0%    0
────────────────────────────────────────────────────────────────
Total            714        ████████████░░░░░░░░░  67%  480
```

CyrusOne's 0% is a known naming-convention mismatch (`AMS1` vs PeeringDB's `"CyrusOne Amsterdam I"`). QTS scrapes campus-level rows that don't align with PeeringDB's facility-level rows. Both go on the roadmap with the existing orphan log.

## Schema

```
data_centers (5,351)            ← canonical facility, dedup'd across sources
   │
   ├─→ source_records (5,891)   ← N:1 — where this row was found, plus raw payload
   │
   ├─→ networks_at_facility ─→ networks (34,732 ASNs)
   │        (57,206 M:N)
   │
   └─→ ixes_at_facility ────→ ixes (1,309 IXPs)
            (4,134 M:N)

cloud_regions (176)             ← separate table, separate map layer
```

The **canonical / source-records split** is the architectural pivot — re-scraping a source updates `source_records` while canonical IDs stay stable, so downstream FKs never break.

```sql
-- The dedup primitive
create or replace function match_data_center(
  p_operator text, p_name text,
  p_lat double precision, p_lng double precision,
  p_radius_m integer default 100
) returns uuid ...
```

## Workflows

```bash
npm run dev                # local dev server
npm run ingest             # re-ingest scrapers/out/*.jsonl into Supabase
npm run check:security     # RLS coverage + service-role-leak guard
npm run build              # prod build (runs check:security first)
```

## Performance, SEO, and AEO

The site is built for both classic search and AI answer engines.

- `/api/facilities.geojson` cached at the Vercel edge — Supabase rarely sees a query
- `/api/v1/facilities` is a documented JSON+CSV dataset endpoint with `?format=csv`, `?limit=`, `?offset=` — designed to be crawler- and notebook-friendly
- Mapbox **client-side clustering** with `clusterProperties.sum_networks` for density-aware glow
- Every `/facility/[slug]` ships **two JSON-LD blocks**: a `Place` schema with `geo`, `address`, and every spec as `additionalProperty`, plus a `FAQPage` with 3–10 templated Q&A pairs ("Who operates X?", "How many networks at X?") — exactly the shape AI answer engines extract verbatim
- Every facility page also renders a visible 1–2 sentence TL;DR paragraph under the H1, generated from the same row data — same prose lives in `<meta description>`
- `/operators` and `/operators/[slug]` server-rendered listings — every operator with 2+ facilities gets a sitemap entry; each detail page ships `CollectionPage` + `ItemList` JSON-LD with every facility
- `/countries` and `/countries/[code]` server-rendered listings — same shape, grouped by city — answers "how many data centers are in Germany?" with one citable page
- `public/llms.txt` (the emerging answer-engine convention) lists the canonical entry points and the dataset endpoint
- `robots.ts` explicitly allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, and 6 others; allows the public dataset endpoints under `/api/`
- Brand-name URLs (`/operators/equinix`, `/operators/databank`, …) 308-redirect to canonical slugs (`equinix-inc`, `databank-ltd`, …) via `next.config.ts`, so the obvious URLs always serve the flagship pages
- Dynamic `sitemap.xml` with **6,153 entries**: 5,351 facilities + 648 operator pages + 148 country pages + 6 statics

## Security

- **RLS** enabled on every public-schema table, `for select` only — anon key is read-only
- **CSP, HSTS, X-Frame-Options** on every response via `next.config.ts`
- **Prebuild guard** (`scripts/check-security.mjs`) fails the deploy if any runtime code references `SUPABASE_SERVICE_ROLE_KEY` or if a `NEXT_PUBLIC_*SERVICE_ROLE*` env exists
- `source_records.raw` keeps full lineage — every spec value traces back to a public URL + fetched_at

## Roadmap

```
Operator-page orphans (geocode + insert as canonical)   +234       next up
Iron Mountain via Playwright (Vercel-checkpoint guarded) +25        next up
Hyperscale buildings (MSFT, GOOG, META, AWS, Apple)     +300–500   researching
More colos (Aligned, Stack, T5, EdgeConneX, …)          +150–250   tractable
Bundled facilities split (Equinix CH1/CH2/CH4 → 3 rows)  +50–100   cheap
Operator-name canonicalization (Equinix vs Equinix Inc.) DB hygiene small
Single-tenant enterprise (banks, retail, gov)           +500–800   multi-year
```

## License

- Code: private
- Data: derived from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and public operator/cloud-provider pages — original licenses apply
- Map tiles: Mapbox

---

Built by [Junna Park](https://github.com/jjpp43). Methodology and source attribution at [/methodology](https://datacenters.world/methodology).
