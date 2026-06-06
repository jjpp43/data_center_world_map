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
| Data centers indexed | **5,351** |
| Countries covered | **148** |
| Networks (ASNs) | **34,732** |
| Internet exchanges | **1,309** |
| Cloud regions | **176** |
| Network ↔ facility links | **57,206** |
| IXP ↔ facility links | **4,134** |
| SEO-indexed detail pages | **5,351** |

Every facility row is deduplicated against multiple sources, linked back to its original records, and rendered as a server-side page with structured data for search engines.

## Why it exists

Public data-center directories disagree about what counts. DataCenterMap lists ~4,300 facilities in the US; Cleanview tracks ~1,600. The difference isn't accuracy — it's definition. This project picks a deliberate inclusion criterion (≥ 500 kW critical IT load, distinct named facility, documented source) and builds an atlas under that scope, with the methodology published openly at [/methodology](https://datacenters.world/methodology).

The result is a smaller but more useful map than the permissive directories — every entry has a verifiable source, no closets-counted-as-data-centers, no defunct sites kept around for SEO.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Server components for SEO-indexed detail pages, client components for the map. Turbopack for fast dev. |
| **Language** | TypeScript 5 | Strict mode across app + scrapers. |
| **Database** | Supabase Postgres + PostGIS | Free tier doesn't sleep per-request. PostGIS for `ST_DWithin` spatial dedup. RLS for security. |
| **Map** | Mapbox GL JS 3.8+ | 2D ↔ 3D globe via `setProjection`, native client-side clustering, sub-100ms style swaps for theme toggling. |
| **Styling** | Tailwind v4 + `@theme inline` | Custom design tokens, dark/light variants via cookie-persisted theme. |
| **Scraping** | Node 22 + `undici` + Playwright (fallback) | Scrapers run as a separate subproject under `scrapers/`. Most operator sites accept plain `undici` with a realistic UA; Iron Mountain is the only one requiring Playwright. |
| **Hosting** | Vercel | Edge CDN caches the GeoJSON endpoint with `s-maxage=3600, stale-while-revalidate=86400`. |
| **Telemetry** | None | No analytics, no cookies beyond the theme preference. |

## Data pipeline

```
                ┌─ External sources ──┐
                │                     │
                │  PeeringDB API      │
                │  OpenStreetMap      │
                │  AWS / GCP / Azure  │
                │  Oracle Cloud       │
                │  Equinix IBX pages  │
                │  Digital Realty     │
                │  DataBank           │
                │  Cologix            │
                │  CoreSite           │
                │  CyrusOne           │
                │  QTS                │
                └──────────┬──────────┘
                           │
                           ▼  (one scraper per source, in scrapers/)
                ┌──────────────────────────────────┐
                │  JSONL files in scrapers/out/    │
                │  • facilities.<source>.jsonl     │
                │  • cloud_regions.<provider>.jsonl│
                │  • peeringdb_{net,ix,netfac,ixfac}│
                └──────────────────┬───────────────┘
                                   │
                                   ▼  npm run ingest
                ┌──────────────────────────────────┐
                │  scripts/ingest.ts               │
                │  • upserts to data_centers       │
                │  • runs match_data_center() RPC  │
                │  • writes source_records         │
                │  • logs orphans for review       │
                └──────────────────┬───────────────┘
                                   │
                                   ▼
                ┌──────────────────────────────────┐
                │  Supabase Postgres + PostGIS     │
                │  • 5,351 canonical facilities    │
                │  • 5,891 source records          │
                │  • RLS-protected public-read     │
                └──────────────────┬───────────────┘
                                   │
                                   ▼  (anon key, server-side)
                ┌──────────────────────────────────┐
                │  Next.js app                     │
                │  • /api/facilities.geojson       │
                │  • /facility/[slug] (5,351 SSR)  │
                │  • /about, /methodology          │
                └──────────────────────────────────┘
```

The pipeline is **idempotent end-to-end**. Re-running any scraper produces identical JSONL (sorted by slug). Re-running `npm run ingest` produces identical database state. This is what lets the system be re-built from raw sources in one command.

## How we aggregated the data

Three pillars, ingested in dependency order:

### 1. Location & identity (PeeringDB + OSM)

**PeeringDB** is the authoritative directory for interconnect-relevant facilities — operators list themselves to make peering easier. Hit `/api/facility`, normalize, write `facilities.peeringdb.jsonl`. Yields **5,256 rows** across 147 countries.

**OpenStreetMap** is a permissive crowd-tagged source. Overpass API query for `telecom=data_center`. Yields 210 observed rows, of which 115 dedup against PeeringDB via the `match_data_center` function. **95 net-new facilities** retained.

The ingester treats PeeringDB as the canonical seed and matches OSM rows against it. Of 210 OSM rows, 208 matched existing PeeringDB rows by `(operator, name)` or 100m proximity; 2 became new canonical rows.

### 2. Spec enrichment (7 operator websites)

PeeringDB doesn't publish power capacity, cabinet density, or PUE — that data lives on each operator's marketing site. We built a scraper per operator that extracts these specs and matches them back to canonical facility rows.

| Operator | Scraped | Matched | Notes |
|---|---:|---:|---|
| Equinix | 227 | 183 (81%) | IBX pages, no lat/lng published |
| Digital Realty | 240 | 161 (67%) | Drupal `__NEXT_DATA__` blob with lat/lng |
| Cologix | 48 | 43 (90%) | Per-facility spec pages |
| DataBank | 76 | 61 (80%) | Best `power_mw` coverage at 100% |
| CoreSite | 24 | 23 (96%) | One page per metro, h3-block per facility |
| CyrusOne | 51 | 0 (0%) | Metro-code naming gap (`AMS1` vs "Amsterdam") |
| QTS | 48 | 9 (19%) | Campus-level scrape vs PeeringDB facility-level |
| **Total** | **714** | **480** (67%) | 234 orphans for follow-up geocoding |

Three-stage matcher:
1. **`match_data_center` RPC** — exact `(operator, name)` match, or 100m PostGIS proximity if lat/lng provided
2. **Operator-prefix + name-prefix fuzzy match** — handles `Equinix` → `Equinix, Inc.` aliasing and `Equinix LD8` → `Equinix LD8 - London, Docklands` prefix expansion
3. **Code-in-name word match** — handles `(AT1)` matching `CoreSite - Atlanta (AT1)` and `CH2` matching `Equinix CH1/CH2/CH4 - Chicago`

Each matched record enriches the canonical row's spec fields (`power_mw`, `space_sqft`, `min_cabinet_density_kw`, `ups_redundancy`, `pue`, …) and adds a row to `source_records`. Unmatched records go to `orphans.operator-pages.jsonl` for review.

### 3. Interconnect graph (PeeringDB networks + IXes)

Four PeeringDB endpoints scraped and ingested as relationship tables:

```
networks            (34,732 ASNs)              ← /api/net
ixes                (1,309 IXPs)               ← /api/ix
networks_at_facility (57,206 N:M)              ← /api/netfac → resolve to data_center_id
ixes_at_facility    (4,134 M:N)                ← /api/ixfac  → resolve to data_center_id
```

The `networks_at_facility` join (M:N between ASNs and physical facilities) is what enables the marker network-density glow on the map — denser interconnect hubs render brighter and have higher `circle-sort-key` so they draw on top of smaller neighbors.

## Database schema

```
data_centers                  ← canonical facility row (5,351)
├─ id (uuid)                  ← stable identity
├─ slug (text, unique)        ← URL routing
├─ name, operator, code       ← identifying triple
├─ address, city, country     ← location text
├─ lat, lng + geom (geography) ← PostGIS spatial column
├─ status (operational | …)
├─ power_mw, space_sqft,      ← physical specs
│  tier, pue, year_built,     ← (enriched from operator pages)
│  ups_redundancy, …
└─ certifications, security (jsonb)

source_records                ← every place this facility was found (5,891)
├─ data_center_id (FK)        ← N:1 → data_centers
├─ source                     ← peeringdb | osm | equinix-com | …
├─ source_id                  ← stable identifier within that source
├─ source_url                 ← citable URL
├─ raw (jsonb)                ← original payload, kept for re-ingestion
└─ fetched_at

networks (34,732)             ← M:N → data_centers via networks_at_facility
ixes (1,309)                  ← M:N → data_centers via ixes_at_facility
cloud_regions (176)           ← separate table, separate map layer
```

The **canonical / source-records split** is what makes the project re-ingestible. If we re-scrape PeeringDB tomorrow with corrected data, we re-upsert; the canonical `id` stays stable because the slug is stable; downstream foreign keys don't break.

The **`match_data_center(p_operator, p_name, p_lat, p_lng, p_radius_m)`** Postgres function is the dedup primitive — every cross-source ingest calls it before deciding to insert.

```sql
create or replace function match_data_center(
  p_operator text, p_name text,
  p_lat double precision, p_lng double precision,
  p_radius_m integer default 100
) returns uuid ...
```

## Local development

```bash
git clone https://github.com/jjpp43/data_center_world_map.git
cd data_center_world_map
npm install

# Configure env
cp .env.example .env.local   # then fill in values
npm run dev                   # → http://localhost:3000
```

Required environment variables:

| Variable | Purpose | Where it's used |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox access token | Client (map rendering) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Server + client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (read-only via RLS) | Server (DB queries) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Bypasses RLS. | `npm run ingest` only |

Never deploy `SUPABASE_SERVICE_ROLE_KEY` to Vercel production. The runtime app is read-only and doesn't need it. A prebuild guard (`scripts/check-security.mjs`) verifies no client-reachable code references it.

## Project structure

```
app/                       Next.js App Router pages + API routes
├─ page.tsx                Map page (client) + mobile fallback
├─ about/                  Editorial intro
├─ methodology/            Long-form inclusion criteria + sources
├─ facility/[slug]/        Server-rendered facility detail pages
│                          (5,351 SEO-indexed routes)
├─ api/
│  ├─ facilities.geojson/  Aggregated GeoJSON for the map
│  └─ cloud-regions.geojson
├─ sitemap.ts              Dynamic sitemap (1 + 5,351 entries)
├─ robots.ts               Robots policy + sitemap pointer
└─ layout.tsx              Root layout + SEO metadata + JSON-LD

components/                Map UI, editorial components, filter card
lib/                       Supabase client, theme, url-state, types
scripts/                   ingest.ts, check-security.mjs
scrapers/                  Separate Node subproject — one file per source
supabase/migrations/       Sequential SQL migrations (0001 → 0006)
```

## Workflows

**Re-ingest from scraper output:**
```bash
npm run ingest
```
Reads all JSONL in `scrapers/out/`, runs match → enrich → upsert against Supabase. Order in `main()`: cloud regions → PeeringDB facilities → OSM → operator pages → networks → IXes → netfac → ixfac. Idempotent.

**Run security checks:**
```bash
npm run check:security
```
Three checks:
1. No runtime app code references `supabaseAdmin` or `SUPABASE_SERVICE_ROLE_KEY`
2. No `.env*` file has a `NEXT_PUBLIC_*SERVICE_ROLE*` variable (would leak to client)
3. Every public-schema table has RLS enabled (requires service-role key locally)

Also wired into `prebuild` so misconfigured deploys fail fast.

**Add a new operator scraper:**
1. Write `scrapers/<operator>.ts` → emit `scrapers/out/facilities.<operator>.jsonl`
2. Add the source key to the `source_records.source` CHECK constraint in a new migration
3. Add an ingest case to `scripts/ingest.ts`
4. `npm run ingest`

## Performance & SEO

- `/api/facilities.geojson` returns ~5,351 thin GeoJSON features (~1.5MB raw, ~300KB gzip), cached at the Vercel edge with `s-maxage=3600, stale-while-revalidate=86400`. Most users hit the CDN; Supabase rarely sees a query.
- Mapbox does **client-side clustering** with `cluster: true, clusterRadius: 50, clusterMaxZoom: 12` plus `clusterProperties.sum_networks` so clusters glow brighter when they contain dense interconnect hubs.
- Marker rendering uses **nested Mapbox expressions** to combine zoom-based sizing with per-feature network-count scaling. This is non-trivial — see [Mapbox notes in CLAUDE.md](./CLAUDE.md#mapbox-notes-v38) for the expression gotcha.
- Every `/facility/[slug]` page emits **JSON-LD `Place` schema** with structured `geo`, `address`, and per-spec `additionalProperty` entries. This is what powers rich snippets in Google search results.
- Server-rendered with `dynamic = "force-dynamic"` for facility detail pages, `revalidate = 3600` for the About page stats, and pure static for `/methodology`.

## Security

- **RLS on every table** in the `public` schema (migrations 0002, 0004). All policies are `for select` only — the anon key cannot write.
- **CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy** on every response via `next.config.ts`. CSP allows only `'self'`, the specific Supabase host, and `*.mapbox.com`.
- **No service-role key in the runtime app.** The prebuild guard fails the deploy if any runtime code references it.
- **`source_records.raw` audit-friendly:** every spec is traceable to a public source URL with a `fetched_at` timestamp, so the lineage of any value is verifiable.

## Roadmap / Known gaps

The methodology page documents these openly. Highlights:

- **Hyperscale buildings** (+300-500 estimated) — Microsoft, Google, Meta, Apple publish addresses for ESG reporting; AWS doesn't. Coming via direct scrape of provider sustainability pages.
- **Operator-page orphans** (+200-300) — 234 facilities scraped from operator sites but not yet matched to a canonical row because they aren't in PeeringDB. Next step: geocode addresses and insert as new canonicals.
- **Bundled facilities** (+50-100) — PeeringDB lists `Equinix CH1/CH2/CH4 - Chicago` as one row; splitting it using operator-page codes adds ~100 buildings without any new scraping.
- **Single-tenant enterprise** (+500-800) — banks, retailers, government. Hardest category, multi-year. Some signal available from FERC interconnection queues and state permit filings.
- **Iron Mountain** (+25) — currently behind a Vercel security challenge that plain `undici` can't pass; needs Playwright fallback.

## License

Code is private. Data is derived from:
- **PeeringDB** under CC-BY-SA
- **OpenStreetMap** under ODbL
- **Operator-published facility pages** (public marketing content)
- **Cloud provider region pages** (public marketing content)

Original licenses apply to the data. Map tiles by Mapbox.

---

Built by [Junna Park](https://github.com/jjpp43). Methodology and source attribution available at [/methodology](https://datacenters.world/methodology).
