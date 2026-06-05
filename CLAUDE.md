# Data Center World Map — Project Context

A public-facing website mapping every known data center in the world, viewable on a single Mapbox map with a 2D ↔ 3D globe toggle. Built by Junna Park as a personal/portfolio project. Default view focuses on the United States.

## Current status (as of 2026-06-03)

Phase 2 complete + most of phase 3:
- Supabase Postgres + PostGIS schema applied (migrations 0001–0004)
- **5,351** canonical facilities ingested (5,256 from PeeringDB + 95 OSM-only after dedup)
- **34,732** networks + **60,540** network↔facility relationships ingested
- **1,309** Internet Exchanges + **4,134** IX↔facility relationships ingested
- **176** cloud regions ingested (32 AWS + 42 GCP + 58 Azure + 44 Oracle)
- `/api/facilities.geojson` and `/api/cloud-regions.geojson` read from Supabase
- `/facility/[slug]` server-rendered detail page with Sources / Networks / IXPs sections
- Quick-filter chips for top operators (Equinix, Digital Realty, ...) and cloud providers (AWS/GCP/Azure/Oracle focus mode)
- Marker visuals scale by `network_count` (radius, glow, opacity, draw order)

**In-flight**: operator-page scraper brief at `scrapers/scrape-agent-operator-pages.md` — will fill in spec fields (power_mw, space_sqft, cabinet density, certifications) which are ~0% populated from PeeringDB alone.

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** App Router, TypeScript, Tailwind v4 |
| Map | **Mapbox GL JS** — `projection: 'mercator'` ↔ `'globe'`, native client-side clustering |
| Database | **Supabase Postgres + PostGIS** (free tier; doesn't auto-sleep per-request) |
| Hosting | **Vercel** |
| Ingestion | `npm run ingest` against JSONL files in `scrapers/out/` |

## Data model (live)

Migrations applied in order: **0001 (initial), 0002 (RLS), 0003 (cloud_regions extras), 0004 (peering relationships)**. RLS is enabled on every table with `public read` policies for `anon, authenticated`.

```sql
data_centers            -- canonical, user-owned. What the map renders.
source_records          -- N per facility, one per upstream source (peeringdb|osm|user|equinix-com|...)
campuses                -- optional grouping (not yet populated)
cloud_regions           -- separate table + separate map layer
networks                -- one per PeeringDB net_id (ASN)
ixes                    -- one per PeeringDB ix_id (Internet Exchange)
networks_at_facility    -- M:N data_centers ↔ networks
ixes_at_facility        -- M:N data_centers ↔ ixes
```

**Dedup function** (Postgres): `match_data_center(p_operator, p_name, p_lat, p_lng, p_radius_m)` returns existing canonical `id` matching by `(operator, name)` exactly OR within 100m via PostGIS `ST_DWithin`. Used by the OSM ingester (208 of 210 OSM facilities matched existing PeeringDB rows) and will be used by the operator-page ingester.

**Field populated rates** (current):
- T1 (name, operator, country, lat/lng, status) — 100%
- T2 (power_mw, space_sqft, tier, year_built) — **<1%** (PeeringDB doesn't publish these)
- T3 (carriers, ixps via netfac/ixfac, certifications) — 78% network presence, 24% IX presence
- T4 (footprint, photos) — 0%

The operator-page scraper (in flight) will lift T2 to ~80% for the ~440 US facilities operated by the top 8 colos.

## Performance

`/api/facilities.geojson` returns ~5,351 thin features with `network_count` + `ix_count` aggregations via Supabase FK-count syntax (`networks_at_facility(count)`). Cached on Vercel CDN with `s-maxage=3600, stale-while-revalidate=86400`. Paginated server-side because PostgREST default cap is 1000 rows per query.

Mapbox does client-side clustering (`cluster: true, clusterRadius: 50, clusterMaxZoom: 12`) plus `clusterProperties.sum_networks` so clusters glow brighter when they contain dense interconnect hubs.

**Do not** implement per-pan bbox queries — slower UX, worse cache behavior, no win at this scale.

## UI

Full-bleed map with floating UI panels. Dark by default; light toggle in TopBar. Mobile responsiveness deferred.

```
Top bar:     [brand] [search...] [theme toggle]
Top-left:    Filter card
              ├── Quick chips: Equinix · Digital Realty · DataBank · Cologix · EdgeConneX · Flexential · CyrusOne · TierPoint
              ├── Cloud chips: AWS · GCP · Azure · Oracle (focus mode)
              ├── Operator multi-select (typeable)
              ├── Country multi-select (with flags + names via Intl.DisplayNames)
              ├── Status pills (operational / construction / planned)
              └── Power slider + "include unknown"
Top-right:   2D / 3D toggle
Bottom-left: Legend (status colors + cloud-regions on/off)
Bottom-right: Stats (live count, label changes to "AWS regions" in focus mode)
Marker click: 400px right-slide FacilityPanel → "View full page" → /facility/[slug]
```

**Marker visual scaling by network density:**
- Unclustered point radius: zoom-based base + bonus from `network_count` (0 → 3px, 1000 networks → +8px)
- Glow halo radius: same pattern but larger
- Glow opacity: 0.35 (0 networks) → 0.92 (1000 networks)
- `circle-sort-key: network_count` so dense hubs draw above smaller neighbors
- Cluster glow scales by aggregated `sum_networks`

**Mapbox style:** stock `dark-v11` / `light-v11`. Mini-map on detail page uses Mapbox Static Images API (free tier).

**Mapbox expression gotcha:** `["zoom"]` can only be input to a *top-level* `interpolate`/`step`. To combine zoom + property scaling, use nested interpolates: top-level interpolate on zoom, with each stop value being an inner interpolate on the property.

## URL state

All filter and view state is URL-synced and serialized via `lib/url-state.ts` → `serializeUrl` / `parseUrl`:

```
?op=Equinix%2C%20Inc.&country=US,GB&status=operational&minMw=10&unknown=0&q=<slug>&theme=light&map=2d&clouds=0&focus=aws
```

**Default state** (no params): `country=US`, all statuses on, dark theme, globe projection, cloud regions visible, no focus. Sharable views are a core feature.

## Default focus: United States

`DEFAULT_STATE.filters.countries = ["US"]` — fresh visits open with the US filter applied. The auto-fit logic in Map.tsx flies to US bounds on initial facilities load. Click the 🇺🇸 country chip to remove the filter and see all 5,351 facilities globally.

## Cloud provider focus mode

Clicking an AWS/GCP/Azure/Oracle chip in the FilterCard sets `state.providerFocus`. When active:
- All facility markers hide (`filteredFacilities = []`)
- Only that provider's cloud regions show (filtered by country too if a country filter is set)
- Cloud regions layer is forced visible
- Map auto-fits to those regions
- Stats label changes to e.g. "AWS regions"
- URL gets `?focus=aws`

Click the same chip again to deactivate.

## Search in v1

Top-bar with autocomplete. Currently filters in-memory across all loaded facilities. Phase 3 goal: switch to `/api/search?q=...` backed by Postgres `to_tsvector` + `pg_trgm`. Keyboard: `/` focuses, `↑↓` navigate, `Enter` selects, `Esc` clears.

## Project layout (current)

```
data-center-map/
├── app/
│   ├── page.tsx                            # main map (client component)
│   ├── facility/[slug]/page.tsx            # server-rendered detail page
│   ├── api/
│   │   ├── facilities.geojson/route.ts     # Supabase-backed, paginated, FK-count
│   │   └── cloud-regions.geojson/route.ts  # Supabase-backed
│   ├── globals.css                         # Tailwind v4 + class-based dark variant
│   └── layout.tsx                          # Geist + mapbox CSS
├── components/
│   ├── Map.tsx                             # Mapbox wrapper; projection + layers + clustering + fit + network-scaled visuals
│   ├── TopBar.tsx
│   ├── SearchBox.tsx
│   ├── FilterCard.tsx                      # quick chips + multiselects + slider
│   ├── MapToggle.tsx                       # 2D ↔ 3D
│   ├── Legend.tsx
│   ├── Stats.tsx
│   ├── FacilityPanel.tsx                   # right-slide detail with "View full page" link
│   └── NoTokenBanner.tsx                   # overlay when NEXT_PUBLIC_MAPBOX_TOKEN missing
├── lib/
│   ├── supabase.ts                         # supabaseServer (anon) + supabaseAdmin (service role)
│   ├── types.ts                            # Facility, CloudRegion, Filters, FacilityStatus, CloudProvider
│   ├── url-state.ts                        # parseUrl / serializeUrl / DEFAULT_STATE
│   └── countries.ts                        # countryName, countryFlag via Intl.DisplayNames
├── scripts/
│   └── ingest.ts                           # reads scrapers/out/*.jsonl → upserts to Supabase
├── supabase/migrations/
│   ├── 0001_initial.sql                    # tables, indexes, match_data_center function
│   ├── 0002_rls.sql                        # public read policies on all tables
│   ├── 0003_cloud_regions_extra.sql        # services + source_url columns
│   └── 0004_peering_relationships.sql      # networks, ixes, networks_at_facility, ixes_at_facility
├── scrapers/                               # separate Node 22 subproject
│   ├── peeringdb.ts, osm.ts, aws.ts, gcp.ts, azure.ts, oracle.ts
│   ├── peeringdb-net.ts, peeringdb-netfac.ts, peeringdb-ix.ts, peeringdb-ixfac.ts
│   ├── common/                             # shared http, schema, slug, writer helpers
│   ├── data/                               # metro centroid JSONs for cloud regions
│   ├── out/                                # JSONL outputs + report.md
│   └── scrape-agent-operator-pages.md      # ⚠ IN FLIGHT — operator-website spec scraper brief
├── scrape-agent.md                         # original brief (facility location data)
├── scrape-agent-peering-relationships.md   # peering data brief (networks + IXPs)
└── .env.local                              # NEXT_PUBLIC_MAPBOX_TOKEN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## Build phases

1. ✅ **Static MVP** — Next.js + Mapbox + hardcoded seed of ~50 facilities
2. ✅ **DB + PeeringDB ingester** — Supabase + PostGIS, 5,256 facilities flowing
3. 🟡 **More sources + peering data** — OSM (+95), AWS/GCP/Azure/Oracle regions ingested, PeeringDB networks/IXes ingested, operator-page scraper brief written
4. ⏸ **Operator-page spec enrichment** — IN FLIGHT (scraper agent), will populate power_mw/space_sqft/tier/cert fields for top ~440 US colos
5. ⏸ **Mobile responsiveness + submissions + admin UI** — deferred

## Workflow

To re-ingest from scraper output:
```bash
npm run ingest
```
Reads all JSONL files in `scrapers/out/`. Order in `main()`: cloud regions → PeeringDB facilities → OSM → networks → IXes → netfac → ixfac. Idempotent on (slug) and (source, source_id) and (data_center_id, network_id) etc. Logs orphan counts where references can't be resolved.

To pick up new scraper output:
1. Scraper drops new JSONL into `scrapers/out/`
2. If schema needs new columns, write a new migration `0005_*.sql` and apply via Supabase SQL Editor
3. Extend `scripts/ingest.ts` with a new ingest function for that source
4. Add it to `main()` in the right order (parents before children for FK)
5. Run `npm run ingest`
6. Update `app/facility/[slug]/page.tsx` to render the new data if user-facing

## Coding conventions

- **No comments unless the WHY is non-obvious.** Don't narrate WHAT — well-named identifiers do that.
- **No backwards-compat shims** for code that's still pre-production.
- **No try/catch around things that can't fail.** Validate at boundaries (user input, scraper output, API responses), trust internal code.
- **Server Components by default.** Mark `'use client'` only when needed (Mapbox is client-only; FilterCard uses local UI state). The `/facility/[slug]` page is fully server-rendered.
- **No event handlers in Server Component props** — Next 16 enforces this. If a server-rendered link needs `onClick`, extract to a Client Component.
- **No co-author lines in commits** (user preference — never add `Co-Authored-By Claude`).

## Mapbox notes (v3.8+)

- Projection swap: `map.setProjection('globe' | 'mercator')` — no full reinit needed.
- Custom layers must be re-added on `'style.load'` after `setStyle()` — use a `dataRef` to read latest values inside the handler (closure captures stale data otherwise).
- Skip the initial `setStyle` on mount (lastStyleRef pattern) — the constructor already set the style, redundant setStyle racing with style.load causes flicker.
- Layer order: glow layers added before sharp center layers so they render behind.
- `circle-sort-key` (layout property) sorts within a layer — higher values draw on top.
- `clusterProperties` aggregates per-feature values into cluster features: `{ sum_networks: ["+", ["coalesce", ["get", "network_count"], 0]] }`.

## Env vars

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk....         # required for map to render
NEXT_PUBLIC_SUPABASE_URL=https://...    # required for API routes
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...    # required for API routes
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # required for npm run ingest only
```

## Out of scope / known limitations

- **PeeringDB spec gap**: power_mw, year_built, tier are essentially 0% populated. Not a bug — PeeringDB is interconnect-focused and operators don't disclose those fields there. The operator-page scraper is the fix.
- **Hyperscale buildings invisible**: AWS, Google, Microsoft, Meta don't list their own physical buildings anywhere public. We show their cloud *regions* instead (via `cloud_regions` table + dedicated map layer + focus mode).
- **Coverage gap vs Data Center Map (~3,000 US facilities missing)**: PeeringDB's scope is "interconnect-relevant" not "every data center". Single-tenant enterprise DCs, telco POPs, small regional colos are missing. Operator-page scraper closes part of this; full parity needs years of submissions.
- **No mobile responsive layout** yet (floating panels overlap on phones).
- **No user submissions / admin editing** (phase 5).
- **No photos / building footprints** populated yet (columns exist).
- **Photorealistic 3D explicitly rejected** — clean stylized visuals only.
- **datacentermap.com / Cloudscene direct scraping forbidden** by their ToS.
