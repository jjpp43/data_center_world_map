# Data Center World Map — Project Context

Public map of every known data center in the world, viewable on a single Mapbox map with 2D ↔ 3D globe toggle. Personal/portfolio project by Junna Park. Default view focuses on the United States.

## Current status (2026-06-11)

Phases 1–10 + 5b (monetization) shipped. Next active: Phase 9 (orphan canonicalization) or Phase 11 (hyperscale buildings).

- **5,351** facilities (5,256 PeeringDB + 95 OSM-only after dedup); **34,732** networks; **1,309** IXPs; **176** cloud regions; **57,206** network↔fac + **4,134** IX↔fac relations
- **714** operator-page records across 7 colos (Equinix, Digital Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS) → **480 enriched, 234 orphans**. Iron Mountain blocked by Vercel checkpoint, needs Playwright.
- Migrations **0001–0010** applied. RLS public-read-only on every data table; auth-scoped on `api_keys` + `subscriptions`.
- Routes: map at `/`, `/facility/[slug]`, `/about`, `/methodology`, `/api` (docs), `/operators/[slug]`, `/countries/[code]`, `/metros[/slug]`, `/ixps[/slug]`, `/networks/[asn]`, `/density[/tier]`, `/insights[/slug]`. Auth + dashboard at `/login`, `/auth/{callback,signout}`, `/dashboard/{keys,billing}`. Billing wiring at `/api/billing/checkout` + `/api/webhooks/polar`. **Auth-gated dataset API** at `/api/v1/{facilities,operators,countries,cloud-regions}` (JSON + CSV, open CORS, Bearer token required, per-key monthly quota via root `proxy.ts` — Next.js 16 renamed the middleware convention to proxy).
- Mobile: `<MobileHome>` search-first list below `md` breakpoint. Theme cookie-persisted across all server pages.
- SEO/AEO: sitemap ~14k URLs (facilities + operators + countries + metros + IXPs + networks + density tiers + insights). `robots.ts` allows GPTBot/ClaudeBot/PerplexityBot/etc. `public/llms.txt` updated to note the API is gated; HTML pages stay fully public for citation. Brand-name 308 redirects in `next.config.ts`.

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

- **TopBar**: `[brand pill]` `[nav pill: About · Methodology · API]` `[search]` `[theme toggle]` `[AccountPill]` — pill is far-right via `ml-auto` on theme toggle. AccountPill renders solid-white "Sign in →" CTA when signed out, glass "Account ▾" dropdown (API keys · Billing · Sign out) when signed in. Initial state seeded from `SessionProvider` (cookie presence read in root layout) to avoid flash.
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

Read-only, **Bearer-token auth required**, open CORS, edge-cached. Docs at `/api`. HTML pages stay fully public — only JSON/CSV endpoints are gated.

| Endpoint | Returns |
|---|---|
| `/api/v1/facilities` | List w/ filters (country, operator, min_power_mw, status, limit, offset, format) |
| `/api/v1/facilities/{slug}` | Detail w/ specs, networks, IXPs, sources |
| `/api/v1/operators` | Ranked by facility count + country breadth |
| `/api/v1/countries` | All 148 countries with counts |
| `/api/v1/cloud-regions` | Filterable by provider + country |

Helpers in `lib/api.ts`: `jsonResponse`, `csvResponse`, `errorResponse`, `preflight`. Cache budgets: list=5min, detail/aggregate=1hr, all with `stale-while-revalidate`.

**Auth gate**: root `proxy.ts` matches `/api/v1/:path*` (exports `proxy()` + a `config` with `matcher`). No Bearer → 401 with hint to `/login`. Valid Bearer → calls `validate_and_charge_api_key` RPC (SECURITY DEFINER, atomic month-rollover + charge), sets `X-RateLimit-{Tier,Limit,Remaining}` headers. Over quota → 429. Web Crypto SHA-256 so it works in either Edge or Node runtime.

**Tiers (monthly)**: free 1,000 · pro 10,000 ($9.99/mo, 3-day trial) · team 50,000 ($39.99/mo, 3-day trial) · enterprise 5,000,000 (contact). Quotas defined in `lib/api-keys.ts` AND in migration 0012's `validate_and_charge_api_key` CASE — keep both in sync.

## Project layout

```
app/
├── page.tsx                            map (client) + <MobileHome>
├── layout.tsx                          Geist + Geist Mono + WebSite/Organization JSON-LD + SessionProvider
├── facility/[slug]/page.tsx            SSR detail; buildSummary/buildFaqJsonLd/buildPlaceJsonLd
├── about/page.tsx, methodology/page.tsx, api/page.tsx
├── operators/[slug]/page.tsx           landing pages, CollectionPage+ItemList JSON-LD
├── countries/[code]/page.tsx           landing pages
├── metros/{page,[slug]/page}.tsx       Phase 10a — ~60 canonical metros
├── ixps/{page,[slug]/page}.tsx         Phase 10b — 1,309 IXPs
├── networks/{page,[asn]/page}.tsx      Phase 10c — PeeringDB ASNs
├── density/{page,[tier]/page}.tsx      Phase 10d — ultra-dense/dense/standard facets
├── insights/{page,…/page}.tsx          Phase 10f — hub + 3 evergreen articles
├── login/page.tsx                      GitHub OAuth start
├── auth/{callback,signout}/route.ts    OAuth code exchange + signOut
├── dashboard/layout.tsx                auth guard + top nav
├── dashboard/keys/{page,KeysClient}.tsx  create/revoke + per-key quota gauges
├── dashboard/billing/page.tsx          Polar Checkout buttons + current sub
├── api/v1/{facilities,operators,countries,cloud-regions}/route.ts
├── api/{facilities,cloud-regions}.geojson/route.ts   map-internal
├── api/billing/checkout/route.ts       Polar Checkout session creator
├── api/webhooks/polar/route.ts         Polar webhook receiver (signature-verified)
├── sitemap.ts                          ~14k URLs
└── robots.ts                           AI-crawler allowlist

proxy.ts                                root — bearer auth on /api/v1/* (Web Crypto). Next.js 16 renamed `middleware.ts` → `proxy.ts` + the export is `proxy()`.

components/
├── Map.tsx, TopBar.tsx, SearchBox.tsx, FilterCard.tsx, MapToggle.tsx, Legend.tsx
├── FacilityPanel.tsx, MobileHome.tsx, FirstRunHint.tsx, InfoToggle.tsx, NoTokenBanner.tsx
├── AccountPill.tsx                     Sign in / Account dropdown
├── SessionProvider.tsx                 cookie-hint context to avoid auth flash
└── editorial.tsx                       shared editorial primitives (Stat, RankedRow, SectionHeader, …)

lib/
├── supabase.ts                         supabaseServer (anon) + supabaseAdmin (service) + supabaseBrowser
├── supabase-server.ts                  supabaseAuthServer — cookie-aware, server-only
├── theme.ts, api.ts, types.ts, url-state.ts, countries.ts
├── operators.ts, countries-data.ts     loaders for landing pages + sitemap
├── metros-data.ts, ixps-data.ts, networks-data.ts, density.ts, insights-data.ts
├── api-keys.ts                         generateApiKey, hashApiKey, TIER_LIMITS, tierLabel
└── polar.ts                            createCheckoutSession + Standard-Webhooks verifyWebhook (raw fetch, no SDK)

scripts/
├── ingest.ts                           reads scrapers/out/*.jsonl → upserts
└── check-security.mjs                  prebuild guard (allowlists lib/supabase.ts, scripts/, app/api/webhooks/)

supabase/migrations/0001–0010.sql       0007 monetization · 0008 subscriptions · 0009 tier quotas (monthly) · 0010 drop anonymous
public/llms.txt                         AEO entry points; notes API is auth-gated
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
8. ✅ **Monetization (5b)** — Supabase Auth (GitHub OAuth) + per-key monthly quotas + Polar.sh subscriptions.
   - **Auth + keys**: `/login` (GitHub OAuth via server action), `/auth/{callback,signout}`, `/dashboard/keys` (create/revoke + per-key usage gauges). Cookie-scoped Supabase client (`lib/supabase-server.ts`) reads/writes RLS-protected `api_keys`. Browser client (`lib/supabase.ts` → `supabaseBrowser`) drives the AccountPill state.
   - **Proxy gate** (Next.js 16 — was middleware): root `proxy.ts` gates `/api/v1/*`. No Bearer → 401 (no DB call). Valid Bearer → `validate_and_charge_api_key` RPC atomically rolls over monthly bucket, charges +1, returns `(tier, remaining, monthly_limit)`. `X-RateLimit-*` headers on every response. Web Crypto SHA-256 so it works in Edge or Node runtime.
   - **Billing**: `/dashboard/billing` shows current sub + Pro/Team upgrade buttons. `POST /api/billing/checkout` creates a Polar Checkout session (raw fetch, no SDK) with `metadata={user_id,tier}`, redirects to hosted page. `POST /api/webhooks/polar` verifies Standard-Webhooks signature (HMAC-SHA256), parses event, calls `upsert_subscription_and_apply_tier` RPC which writes `subscriptions` AND propagates tier to every non-revoked `api_keys` row the user owns. Webhook handler is the ONE runtime spot using `supabaseAdmin` — `app/api/webhooks/` allowlisted in `scripts/check-security.mjs`.
   - **Polar.sh chosen over Stripe** for Korean-bank payout + merchant-of-record VAT/sales-tax handling. Fees ~4% + 40¢ vs Stripe's 2.9% + 30¢.
   - **First-time deployment checklist** (one-time, when standing up a fresh env):
     1. Apply migrations `0007`–`0010` to Supabase
     2. Enable GitHub provider in Supabase Auth
     3. Register a GitHub OAuth app with callback URL set to **Supabase's** `https://<project-ref>.supabase.co/auth/v1/callback` (NOT our app's `/auth/callback` — Supabase is the OAuth relay)
     4. Set `NEXT_PUBLIC_SITE_URL=https://datacenters.world` in Vercel env
     5. Create Pro + Team subscription products in Polar.sh
     6. Set `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_PRODUCT_ID`, `POLAR_TEAM_PRODUCT_ID` in Vercel env, redeploy
     7. Register webhook endpoint `https://datacenters.world/api/webhooks/polar` in Polar dashboard with format=Raw, events=subscription.{created,updated,active,canceled,revoked}
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
# Mapbox + Supabase (always required)
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # ingest + webhook handler only — runtime allowlist in check-security.mjs
NEXT_PUBLIC_SITE_URL=https://...        # used by OAuth redirect + Polar success_url; defaults to https://datacenters.world

# Monetization (Phase 5b)
POLAR_ACCESS_TOKEN=polar_oat_...        # scopes: checkouts:write (+ read/products/customers optional)
POLAR_WEBHOOK_SECRET=whsec_...          # from Polar webhook endpoint config
POLAR_PRO_PRODUCT_ID=<prod_id>          # if unset, /dashboard/billing shows "Coming soon"
POLAR_TEAM_PRODUCT_ID=<prod_id>         # same
POLAR_API_BASE=https://api.polar.sh     # optional override (sandbox: https://sandbox-api.polar.sh)
```

## Security

RLS on every public table (public-read on data tables; auth-scoped via `auth.uid()` on `api_keys` + `subscriptions`) · CSP/HSTS/X-Frame from `next.config.ts` · CORS open on `/api/v1/*` only (but Bearer required) · API keys hashed sha256 at rest, never stored plaintext · Polar webhooks signature-verified (Standard Webhooks HMAC-SHA256, 5-min timestamp tolerance, timing-safe compare).

`scripts/check-security.mjs` (also `prebuild`) blocks: any `supabaseAdmin`/`SUPABASE_SERVICE_ROLE_KEY` reference in runtime code outside the allowlist (`lib/supabase.ts`, `scripts/`, `app/api/webhooks/`), any `NEXT_PUBLIC_*SERVICE_ROLE*` env, any non-extension public table without RLS. `SUPABASE_SERVICE_ROLE_KEY` is needed in Vercel runtime now (the Polar webhook handler uses it) — that's the one intentional exception, gated by the path allowlist.

## Monetization

- **5a ✅**: free public API + docs validated demand
- **5b ✅**: GitHub-OAuth-gated API keys + per-key monthly quotas + Polar.sh subscriptions. Tiers: Free 1k/mo · Pro 10k/mo $9.99 (3-day trial) · Team 50k/mo $39.99 (3-day trial) · Enterprise 5M/mo contact. API is auth-only (migration 0010) — every `/api/v1/*` request needs a Bearer token. HTML pages stay fully public for citation.
- **5c (parallel, future)**: newsletter capture on `/about`, paywall deeper analysis $20–30/mo
- **5d (future)**: sponsored operator profiles ($50–200/facility/year) — verified badge + enhanced page. Inclusion is *never* paid.

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
