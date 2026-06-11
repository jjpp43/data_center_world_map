# Data Center World Map — Project Context

Public map of every known data center in the world, viewable on a single Mapbox map with 2D ↔ 3D globe toggle. Personal/portfolio project by Junna Park. Default view focuses on the United States.

## Current status (2026-06-08)

Phases 1–5a shipped. Next: Phase 5b (API keys + Stripe).

- **5,351** facilities (5,256 PeeringDB + 95 OSM-only after dedup); **34,732** networks; **1,309** IXPs; **176** cloud regions; **57,206** network↔fac + **4,134** IX↔fac relations
- **714** operator-page records across 7 colos (Equinix, Digital Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS) → **480 enriched, 234 orphans**. Iron Mountain blocked by Vercel checkpoint, needs Playwright.
- Migrations 0001–0006 applied. RLS public-read-only on every table.
- Routes: map at `/`, `/facility/[slug]` (SSR + Place+FAQPage JSON-LD), `/about`, `/methodology`, `/api` (docs), `/operators/[slug]`, `/countries/[code]`, `/metros[/slug]`, `/ixps[/slug]`, `/networks/[asn]`, `/density[/tier]`, `/insights[/slug]`, auth + dashboard at `/login`, `/auth/{callback,signout}`, `/dashboard/{keys,billing}`, billing routes `/api/billing/checkout` + `/api/webhooks/polar`, public dataset API at `/api/v1/{facilities,operators,countries,cloud-regions}` (JSON + CSV, open CORS, bearer-token auth optional with `X-RateLimit-*` headers)
- Mobile: `<MobileHome>` search-first list below `md` breakpoint. Theme cookie-persisted across all server pages.
- SEO/AEO: sitemap 6,153 URLs, `robots.ts` allows GPTBot/ClaudeBot/PerplexityBot/etc, `public/llms.txt`, brand-name 308 redirects in `next.config.ts` (`/operators/equinix` → `/operators/equinix-inc`)

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, TS strict, Tailwind v4 |
| Fonts | Geist Sans + **Geist Mono** (Mono for all numerics) |
| Map | Mapbox GL JS 3.8+ — `setProjection('globe'|'mercator')` |
| DB | Supabase Postgres + PostGIS |
| Hosting | Vercel, edge-cached, CSP/HSTS/X-Frame in `next.config.ts` |
| Ingest | `npm run ingest` reads `scrapers/out/*.jsonl` |
| Security | `npm run check:security` (also runs as `prebuild`) |

## Data model

```
data_centers (5,351)          ← canonical
  ├→ source_records           ← N:1, raw payload kept
  ├→ networks_at_facility →   networks (34,732 ASNs)
  └→ ixes_at_facility    →    ixes (1,309 IXPs)
cloud_regions (176)           ← separate table, separate map layer
campuses                      ← unused
```

**Dedup primitive**: `match_data_center(operator, name, lat, lng, radius_m)` — exact `(operator, name)` OR PostGIS `ST_DWithin` within 100m.

**Three-stage matcher** in `scripts/ingest.ts` for operator-page records (often missing lat/lng and using short operator strings):
1. `match_data_center` RPC
2. `operator ILIKE 'X%' AND name ILIKE 'Y%'` → handles "Equinix" → "Equinix, Inc."
3. `operator ILIKE 'X%' AND name ~* '\m<CODE>\M'` → handles "(AT1)" in "CoreSite - Atlanta (AT1)" and bundled rows like "Equinix CH1/CH2/CH4 - Chicago"
4. → `orphans.operator-pages.jsonl`

**Field populated rates**: T1 (name/operator/country/lat/lng/status) 100% · power_mw on 71 rows · space_sqft on 388 · code on 429 · ups_redundancy on 296. PeeringDB publishes essentially zero spec data; operator pages closed the gap on the matched subset. `tier`/`year_built` ≈ 0% — no operator publishes them.

## UI

Full-bleed map (desktop). Below `md`: `<MobileHome>` search-first list. Dark default, light theme persists via `dcw-theme` cookie.

- **TopBar**: `[brand pill]` `[nav pill: About · Methodology · API]` `[search]` `[theme toggle]`
- **FilterCard** (top-left, collapsible): visible/total count in header · quick operator chips · cloud chips (focus mode) · searchable operator + country multi-selects
- **MapToggle** top-right · **Legend** bottom-left (collapsed pill, click to expand) · **FirstRunHint** fades in once (localStorage)
- **Marker click** → 400px right-slide `FacilityPanel` with info icons + "View full page" → `/facility/[slug]`
- **Cloud-region click** → Mapbox popup with provider, code, AZ count, launch year

**Filter scope**: operators + countries only. Power slider and status filter both removed (status 100% operational, power_mw 1.3% populated). Re-add when data justifies.

**Marker network-density scaling**: radius (+0–8px from `network_count`), glow opacity (0.35→0.92), `circle-sort-key: network_count`. Cluster glow scales by `clusterProperties.sum_networks`.

**Cloud provider colors** (no facility-status collision): AWS `#ff9d2e` orange · GCP `#a855f7` purple (*not* blue/green) · Azure `#3aa0e6` cyan-blue · Oracle `#ff5757` red.

## Design system (editorial pages)

`/about`, `/methodology`, `/api`, `/operators`, `/countries` share visual vocabulary. Primitives in `components/editorial.tsx`: `<Stat>` (hero/md/sm), `<Test>`, `<MatrixRow>`, `<Source>`, `<Gap>`, `<RankedRow>` (sparkbar), `<EditorialHeader>`.

- Floating-glass cards (`backdrop-blur-md` + semi-transparent + subtle indigo glow)
- Geist Mono numerics + `§N` section numbering on methodology/API
- Emerald pulse dots for live-data signal · dot-grid hero background
- **Color semantics**: indigo = decorative · emerald = live/verified · blue = interactive (links/CTA) · amber = pending/incomplete

## URL state

Map view URL-synced via `lib/url-state.ts`:
```
?op=Equinix%2C%20Inc.&country=US,GB&q=<slug>&theme=light&map=2d&clouds=0&focus=aws
```
Default: `country=US`, dark, globe, clouds on, no focus. **Do not** add per-pan bbox queries — slower UX, worse cache, no win.

## Public API (v1)

Read-only, no auth, open CORS, edge-cached. Docs at `/api`.

| Endpoint | Returns |
|---|---|
| `/api/v1/facilities` | List w/ filters (country, operator, min_power_mw, status, limit, offset, format) |
| `/api/v1/facilities/{slug}` | Detail w/ specs, networks, IXPs, sources |
| `/api/v1/operators` | Ranked by facility count + country breadth |
| `/api/v1/countries` | All 148 countries with counts |
| `/api/v1/cloud-regions` | Filterable by provider + country |

Helpers in `lib/api.ts`: `jsonResponse`, `csvResponse`, `errorResponse`, `preflight`. Cache budgets: list=5min, detail/aggregate=1hr, all with `stale-while-revalidate`.

## Project layout

```
app/
├── page.tsx                            map (client) + <MobileHome>
├── facility/[slug]/page.tsx            SSR detail; buildSummary/buildFaqJsonLd/buildPlaceJsonLd
├── about/page.tsx                      slim intro
├── methodology/page.tsx                long-form spec
├── api/page.tsx                        API docs
├── api/v1/{facilities,operators,countries,cloud-regions}/route.ts
├── api/{facilities,cloud-regions}.geojson/route.ts   map-internal
├── operators/[slug]/page.tsx           landing pages, CollectionPage+ItemList JSON-LD
├── countries/[code]/page.tsx           landing pages
├── sitemap.ts                          6,153 URLs
├── robots.ts                           AI-crawler allowlist
└── layout.tsx                          Geist + Geist Mono + WebSite/Organization JSON-LD

components/
├── Map.tsx, TopBar.tsx, SearchBox.tsx, FilterCard.tsx, MapToggle.tsx, Legend.tsx
├── FacilityPanel.tsx, MobileHome.tsx, FirstRunHint.tsx, InfoToggle.tsx, NoTokenBanner.tsx
└── editorial.tsx                       shared editorial primitives

lib/
├── supabase.ts                         supabaseServer (anon) + supabaseAdmin (service)
├── theme.ts                            getTheme() — cookie persistence
├── api.ts                              response helpers
├── operators.ts, countries-data.ts     loaders for landing pages + sitemap
└── types.ts, url-state.ts, countries.ts

scripts/
├── ingest.ts                           reads scrapers/out/*.jsonl → upserts
└── check-security.mjs                  prebuild guard

supabase/migrations/0001–0006.sql
public/llms.txt                         AEO entry points for AI crawlers
next.config.ts                          headers + OPERATOR_ALIASES 308 redirects
scrapers/                               separate Node 22 subproject (out/ and cache/ gitignored)
```

## Build phases

1. ✅ Static MVP
2. ✅ DB + PeeringDB ingester
3. ✅ More sources (OSM, AWS/GCP/Azure/Oracle, PeeringDB networks/IXes)
4. ✅ Operator-page spec enrichment (480 matched, 234 orphans)
5. ✅ AEO/SEO surfaces — `/operators`, `/countries`, FAQ JSON-LD, llms.txt, 6,153 sitemap URLs, AI-bot allowlist
6. ✅ v1 public API + docs (5a)
7. ✅ **Pivots & taxonomy expansion (Phase 10)** — multiply data value through additional lenses, zero new ingest. Inspired by cleanview.co's multi-pivot categorization.
   - 10a ✅ **Metros** — `/metros` + `/metros/[slug]` for ~60 canonical metros (NoVA, FLAP-D, Singapore, Tokyo…). Industry-standard unit; matches how operators/customers think.
   - 10b ✅ **IXP entity pages** — `/ixps` + `/ixps/[slug]` for all 1,309 IXPs with member-facility lists, ranked by `net_count`
   - 10c ✅ **Network entity pages** — `/networks` + `/networks/[asn]` for PeeringDB ASNs (URL = integer ASN); sitemap filters to ≥2 facility presences
   - 10d ✅ **Density classification** — `/density` + `/density/[tier]` for ultra-dense (50+), dense (10–49), standard (1–9) facet pages. Map filter chips deferred to keep map UI stable.
   - 10e ✅ (folded into 10f) — Regional rankings exist as cross-pivot sections on `/metros/[slug]`, `/countries/[code]`, `/ixps/[slug]`, `/networks/[asn]`. Dedicated `/rankings/*` pages judged redundant with these.
   - 10f ✅ **Insight pages** — `/insights` hub + 3 evergreen articles: `most-network-dense-facilities` (top 50), `largest-ixps-globally` (top 25), `peering-hub-metros` (top 20 by aggregate density). Article JSON-LD; same editorial design language as `/about` and `/methodology`.
   - **Deferred polish** — cloud-adjacency classification (needs PostGIS proximity join `data_centers × cloud_regions`); facility type heuristic; FilterCard density chips on the live map.
8. ✅ **Monetization (5b)** — split into 5b.1 (auth foundation) and 5b.2 (Polar.sh wiring).
   - 5b.1 ✅ **Auth + API keys + middleware + rate limits**: Supabase Auth (GitHub OAuth), `/login`, `/auth/callback`, `/dashboard/keys` (create/revoke + per-key monthly quota gauges), root `middleware.ts` on `/api/v1/*` doing bearer validation via `validate_and_charge_api_key` RPC and anonymous IP throttle via `charge_anonymous` RPC. Postgres-based rate limiting (no Upstash dependency). `X-RateLimit-Tier`/`-Limit`/`-Remaining` headers on every response. **Tiers (all monthly, set in migration 0009)**: anonymous 500/mo per IP · free 1k/mo · pro 10k/mo · team 50k/mo · enterprise 5M/mo. Monthly across all tiers (incl. anonymous) since the atlas isn't live data — edge cache covers most duplicate hits.
   - 5b.2 ✅ **Polar.sh wiring** — `/dashboard/billing` shows current subscription + Pro/Team upgrade buttons. `POST /api/billing/checkout` creates a Polar Checkout session (server-side, no SDK), redirects to hosted checkout. `POST /api/webhooks/polar` verifies Standard-Webhooks signature (HMAC-SHA256), then calls `upsert_subscription_and_apply_tier` RPC which writes to `subscriptions` AND propagates the tier to every active `api_keys` row the user owns. Webhook handler is the ONE runtime spot using `supabaseAdmin` — `app/api/webhooks/` allowlisted in `scripts/check-security.mjs`.
   - **Manual ops** before 5b goes live in prod:
     (1) apply migrations `0007_monetization.sql` and `0008_subscriptions.sql` to Supabase
     (2) enable GitHub provider in Supabase Auth
     (3) register a GitHub OAuth app with callback URL `https://datacenters.world/auth/callback`
     (4) set `NEXT_PUBLIC_SITE_URL` env in Vercel
     (5) create Pro + Team products in Polar.sh; set `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_PRODUCT_ID`, `POLAR_TEAM_PRODUCT_ID` env vars
     (6) register webhook endpoint `https://datacenters.world/api/webhooks/polar` in Polar dashboard
   - Polar.sh chosen over Stripe for Korean-bank payout + merchant-of-record VAT/sales-tax handling. Fees ~4% + 40¢ vs Stripe's 2.9% + 30¢.
9. ⏸ Orphan canonicalization + Iron Mountain (Playwright)
10. ⏸ Hyperscale buildings (scrape Microsoft + Google ESG pages, +300–500 facilities)
11. ⏸ User submissions + admin UI

## Workflow

```bash
npm run dev
npm run ingest             # re-ingest scrapers/out/*.jsonl → Supabase
npm run check:security     # RLS coverage + service-role-leak guard
npm run build              # prebuild runs check:security
```

Ingest order in `main()`: cloud regions → PeeringDB facilities → OSM → operator pages → networks → IXes → netfac → ixfac. Idempotent on (slug), (source, source_id), (data_center_id, network_id).

**To add a source**: new JSONL in `scrapers/out/` → new migration if schema needs columns → extend `scripts/ingest.ts` + add to `main()` → run ingest → update `app/facility/[slug]/page.tsx` if user-facing → update `app/api/v1/facilities/[slug]/route.ts` SELECT + docs if public.

## Coding conventions

- **No comments unless WHY is non-obvious.** Don't narrate WHAT.
- **No backwards-compat shims** for pre-production code.
- **No try/catch** around code that can't fail. Validate only at boundaries.
- **Server Components by default.** `'use client'` only when needed.
- **No event handlers in Server Component props** (Next 16 enforces). Extract to Client Component.
- **No co-author lines in commits** (user preference — never add `Co-Authored-By Claude`).
- **No emojis in code** unless asked.

## Mapbox notes (v3.8+)

- `setProjection('globe'|'mercator')` — no reinit needed
- After `setStyle()` custom layers must be re-added on `'style.load'`. Use a `dataRef` (closures capture stale data)
- Skip initial `setStyle` on mount (`lastStyleRef` pattern) — constructor already set it; redundant setStyle races style.load → flicker
- Glow layers added *before* sharp center layers → render behind
- `circle-sort-key` (layout) sorts within a layer; higher = on top
- `clusterProperties`: `{ sum_networks: ["+", ["coalesce", ["get", "network_count"], 0]] }`
- **Expression gotcha**: `["zoom"]` can only be input to a *top-level* `interpolate`/`step`. For zoom + property scaling use nested interpolates.
- Cloud-region popups: `new mapboxgl.Popup({...}).setLngLat(c).setHTML(h).addTo(map)`. Tailwind classes work if bundled elsewhere.

## Env vars

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # ingest only — NEVER in Vercel runtime
NEXT_PUBLIC_SITE_URL=https://...        # optional, defaults to https://datacenters.world
```

## Security

RLS public-read-only on every table · CSP/HSTS/X-Frame from `next.config.ts` · CORS open on `/api/v1/*` only · `scripts/check-security.mjs` (also `prebuild`) blocks: any `supabaseAdmin`/`SUPABASE_SERVICE_ROLE_KEY` reference in runtime code, any `NEXT_PUBLIC_*SERVICE_ROLE*` env, any public table without RLS. Service-role key must not exist in Vercel production.

## Monetization

- **5a (done)**: free public API + docs → validates demand
- **5b (next)**: API keys + Stripe + tiers (Free / Pro $30–50 / Team $300–500 / Enterprise $5K)
- **5c (parallel)**: newsletter capture on `/about`, paywall deeper analysis $20–30/mo
- **5d**: sponsored operator profiles ($50–200/facility/year) — verified badge + enhanced page. Inclusion is *never* paid.

**Avoid**: pay-to-list, hard paywall on public map, aggressive lead-gen forms.

## Out of scope / known limitations

- **PeeringDB spec gap**: tier/year_built ≈ 0%. Operator pages closed power/space partially.
- **Hyperscale buildings invisible**: AWS/Google/MS/Meta don't publish. We show cloud *regions* instead. Roadmap: scrape MS + Google ESG pages.
- **234 operator-page orphans**: scraped but unmatched (mostly DR/Equinix/CyrusOne sites not in PeeringDB). Geocode + insert as new canonicals = +200–300 (Phase 7).
- **Iron Mountain**: Vercel Security Checkpoint blocks `undici`. Needs Playwright.
- **Coverage gap vs DataCenterMap (~2,600 US missing)**: PeeringDB scope is interconnect-relevant only. Single-tenant enterprise, telco POPs, small colos missing.
- **No interactive mobile map** (intentional — `<MobileHome>` list fallback).
- **No user submissions / admin** (Phase 9).
- **No photos / footprints** populated (columns exist).
- **Photorealistic 3D rejected** — stylized only.
- **datacentermap.com / Cloudscene scraping forbidden** by their ToS.
