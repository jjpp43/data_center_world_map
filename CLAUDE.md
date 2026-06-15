# Data Center World Map — Project Context

Public map of every known data center on Earth — single Mapbox view with 2D ↔ 3D toggle. Solo project by Junna Park. Default view focuses on the US.

## Current status

Phases 1–11 + 5b (monetization) + 9 (orphan canonicalization + Iron Mountain) shipped. Migrations `0001–0016` applied. No user submissions — site is purely a curated/scraped dataset.

- **5,675** facilities · **34,732** networks · **1,309** IXPs · **176** cloud regions · **57,206** network↔fac · **4,134** IX↔fac
- Sources: PeeringDB (5,256), OSM-only (95), operator-pages canonicalized (230), Iron Mountain (4 new + 19 enriched), Google buildings (58), Meta buildings (32). Microsoft Azure deferred — they only publish region grain, which `cloud_regions` already covers.
- Field fill rates: T1 fields (name/operator/country/lat/lng/status) 100% · `power_mw` 2.4% · `space_sqft` 9.7% · `year_built` 0.7% (Meta added 32) · `pue` 1.3%.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, TS strict, Tailwind v4 |
| Fonts | Geist Sans + **Geist Mono** (Mono for all numerics) |
| Map | Mapbox GL JS 3.8+ — `setProjection('globe'\|'mercator')` |
| DB | Supabase Postgres + PostGIS |
| Hosting | Vercel, edge-cached, CSP/HSTS/X-Frame in `next.config.ts` |
| Scrapers | Separate Node 22 subproject. Playwright for Vercel-checkpoint sites (Iron Mountain, datacenters.google) |
| Analytics | PostHog Cloud (client-only), proxied through `/ingest/*` to dodge ad-blockers |
| Security | `npm run check:security` (also runs as `prebuild`) |

## Data model

```
data_centers (5,675)          ← canonical
  ├→ source_records           ← N:1, raw payload kept
  ├→ networks_at_facility →   networks (34,732 ASNs)
  └→ ixes_at_facility    →    ixes (1,309 IXPs)
cloud_regions (176)           ← separate table, separate map layer
api_keys, subscriptions       ← auth-scoped via RLS
api_key_usage_daily           ← per-day rollup for dashboard chart (mig 0011)
```

**Dedup primitive**: `match_data_center(operator, name, lat, lng, radius_m)` — exact `(operator, name)` OR PostGIS `ST_DWithin` within radius. **Warning**: spatial branch matches across operators — fine for the first ingest but **wrong** for orphan/Iron Mountain/hyperscale canonicalization, which use a strict 3-tier matcher (exact name → `operator ILIKE 'X%' AND name ILIKE 'Y%'` → `operator ILIKE 'X%' AND name ~* '\m<CODE>\M'`, no spatial). See `scripts/canonicalize-orphans.ts` and `scripts/ingest-*.ts`.

## UI

Full-bleed map (desktop). Below `md`: `<MobileHome>` search-first list. Dark default, light theme persists via `dcw-theme` cookie.

**Theme** is applied by an inline pre-paint script in `app/layout.tsx` that toggles `.dark` on `<html>` from the cookie before React hydrates. The home page's toggle effect keeps `documentElement.classList` in sync. Server pages don't read the cookie — that's what enables ISR (see § Caching/egress).

- **TopBar**: `[brand]` `[nav: About · Methodology · API]` `[search]` `[theme]` `[AccountPill]` — AccountPill is solid-white "Sign in →" CTA when signed out, glass "Account ▾" dropdown (Dashboard, Sign out) when signed in. Initial state seeded by `SessionProvider` reading the Supabase auth cookie client-side (lazy `useState`) to avoid flash. AccountPill also rendered by `EditorialHeader` so it's visible on `/about`, `/methodology`, `/api`.
- **FilterCard** (top-left, collapsible): operator + country multi-selects, cloud focus chips. Power slider and status filter removed (status 100% operational; power_mw 2.4%).
- **MapToggle** (top-right), **Legend** (bottom-left, collapsed pill), **FirstRunHint** (fades in once via localStorage).
- **Marker click** → 400px right-slide `FacilityPanel` → "View full page" → `/facility/[slug]`.
- **Cloud-region click** → Mapbox popup with provider, code, AZ count, launch year.

**Map light style** is tinted at runtime by `tintLightBase()` in `components/Map.tsx` — overrides background + land/landcover/landuse fills to `#e7eaf0` (soft cool-gray) so the basemap reads distinct from white overlay buttons. Dark style untouched.

**Overlay surfaces** (TopBar, FilterCard, MapToggle, Legend, AccountPill) all use `bg-white/95` + `border-zinc-300/80` in light mode — solid enough to read against the tinted map.

**Marker network-density scaling**: radius (+0–8px from `network_count`), glow opacity (0.35→0.92), `circle-sort-key: network_count`. Cluster glow scales by `clusterProperties.sum_networks`.

**Cloud provider colors** (no collision with facility status): AWS `#ff9d2e` · GCP `#a855f7` · Azure `#3aa0e6` · Oracle `#ff5757`.

## Design system (editorial pages)

`/about`, `/methodology`, `/api`, `/operators/`, `/countries/`, `/insights/` share visual vocabulary. Primitives in `components/editorial.tsx`: `<Stat>` (hero/md/sm), `<MatrixRow>`, `<Source>`, `<Gap>`, `<RankedRow>`, `<EditorialHeader>`.

- Floating-glass cards (`backdrop-blur-md` + semi-transparent + subtle indigo glow)
- Geist Mono numerics
- **Color semantics**: indigo = decorative/inputs · emerald = live/verified/outputs · blue = interactive (links/CTA) · amber = pending/incomplete

## URL state

Map view URL-synced via `lib/url-state.ts`:

```
?op=Equinix%2C%20Inc.&country=US,GB&q=<slug>&theme=light&map=2d&clouds=0&focus=aws
```

Default: `country=US`, dark, globe, clouds on, no focus. **Do not** add per-pan bbox queries — slower, worse cache, no win.

## Public API (v1)

Read-only REST, **Bearer-token auth required**, open CORS, edge-cached. HTML pages stay fully public — only JSON/CSV is gated.

| Endpoint | Returns |
|---|---|
| `/api/v1/facilities` | List (country, operator, min_power_mw, status, limit, offset, format) |
| `/api/v1/facilities/{slug}` | Detail w/ specs, networks, IXPs, sources |
| `/api/v1/operators` | Ranked by facility count + country breadth |
| `/api/v1/countries` | All 148 countries with counts |
| `/api/v1/cloud-regions` | Filterable by provider + country |

Helpers in `lib/api.ts`: `jsonResponse`, `csvResponse`, `errorResponse`, `preflight`. Cache: list=5min, detail/aggregate=1hr, all `stale-while-revalidate`.

**Auth gate** (`proxy.ts`, matches `/api/v1/:path*`): No Bearer → 401. Valid Bearer → `validate_and_charge_api_key` RPC (SECURITY DEFINER, atomic month-rollover + charge + per-day rollup into `api_key_usage_daily`), sets `X-RateLimit-{Tier,Limit,Remaining}`. Over quota → 429. Web Crypto SHA-256 so it works in Edge or Node runtime.

**Tiers (monthly)**: Free 1,000 · Pro 10,000 ($9.99/mo, 3-day trial) · Team 50,000 ($39.99/mo, 3-day trial) · Enterprise 5,000,000 (contact). Quotas defined in `lib/api-keys.ts` AND migration 0012's `validate_and_charge_api_key` CASE — keep both in sync.

**Docs at `/api`** — chapter-style with sticky left sidebar (scroll-spy via IntersectionObserver, numbered `01–08`), collapsible `<details>` TOC on mobile, JS/Python/cURL code tabs (default JS), per-endpoint response field tables, color-coded sections (indigo = inputs, emerald = outputs). Code blocks render in a dark `bg-zinc-950` "editor" style. Big editorial-style chapter numbers in the main column. Files: `app/api/{page,ApiNav,CodeTabs}.tsx`.

## Project layout

```
app/
├── page.tsx                              map (client) + <MobileHome>; toggles `.dark` on <html>
├── layout.tsx                            Geist + Geist Mono + WebSite JSON-LD + inline theme script + SessionProvider + PostHog
├── facility/[slug]/page.tsx              SSR detail (ISR 7d, unstable_cache per slug); FAQ + Place JSON-LD
├── about/page.tsx, methodology/page.tsx  ISR
├── api/{page,ApiNav,CodeTabs}.tsx        chapter-style docs (ISR 24h)
├── api/v1/{facilities,operators,countries,cloud-regions}/route.ts
├── api/billing/checkout/route.ts         Polar Checkout session creator
├── api/webhooks/polar/route.ts           signature-verified webhook receiver
├── api/cron/refresh-geojson/route.ts     weekly Vercel cron → pings Deploy Hook
├── operators/[slug]/page.tsx             ISR 7d; CollectionPage + ItemList JSON-LD
├── countries/[code]/page.tsx             ISR 7d
├── metros, ixps, networks, density, insights/...   Phase 10 pivots (ISR 7d for per-slug)
├── login/page.tsx                        GitHub OAuth start (server action)
├── auth/{callback,signout}/route.ts      OAuth code exchange + signOut
├── dashboard/{layout,page,KeysClient,KeyNameEditor}.tsx  keys / plan / billing / usage chart
├── sitemap.ts                            ~900 URLs — capped per type (top-500 facilities by network_count, top-200 operators, top-100 IXPs, top-100 networks, all 148 countries, all 30 metros, static pages). Long-tail URLs still resolve on demand.

proxy.ts                                  root — Bearer auth on /api/v1/*. Next.js 16 renamed middleware → proxy.
vercel.json                               weekly cron for /api/cron/refresh-geojson (Sundays 03:00 UTC)

public/
├── facilities.geojson                    baked at build by scripts/build-geojson.ts (gitignored)
└── cloud-regions.geojson                 baked at build (gitignored)

components/
├── Map.tsx, TopBar.tsx, SearchBox.tsx, FilterCard.tsx, MapToggle.tsx, Legend.tsx
├── FacilityPanel.tsx, MobileHome.tsx, FirstRunHint.tsx, InfoToggle.tsx, NoTokenBanner.tsx
├── AccountPill.tsx                       Sign in / Account dropdown (used by TopBar + EditorialHeader)
├── SessionProvider.tsx                   reads Supabase auth cookie client-side via lazy useState
├── PostHog.tsx                           PostHogProvider + PostHogPageView, identify on Supabase auth
└── editorial.tsx                         Stat, RankedRow, SectionHeader, EditorialHeader (renders AccountPill)

lib/
├── supabase.ts                           supabaseServer (anon) + supabaseAdmin (service) + supabaseBrowser
├── supabase-server.ts                    cookie-aware auth client, server-only
├── api-keys.ts                           generateApiKey, hashApiKey, TIER_LIMITS
├── polar.ts                              Polar Checkout + Standard-Webhooks verify (raw fetch)
├── api.ts, types.ts, url-state.ts, countries.ts
└── operators.ts, countries-data.ts, metros-data.ts, ixps-data.ts, networks-data.ts, density.ts, insights-data.ts
                                          all heavy loaders wrapped in unstable_cache (24h, tag "data-centers"/"networks"/"ixes")

scripts/
├── ingest.ts                             reads scrapers/out/*.jsonl → upserts → triggerRebuild()
├── ingest-{ironmountain,google,meta}.ts  per-source ingest (--apply triggers rebuild)
├── canonicalize-orphans.ts               resolves Phase 9 orphans (--apply triggers rebuild)
├── build-geojson.ts                      prebuild step: writes public/{facilities,cloud-regions}.geojson
├── _trigger-rebuild.ts                   POSTs VERCEL_DEPLOY_HOOK_URL; no-op if unset
├── audit-quality.ts, audit-orphans.ts    read-only audit reports
└── check-security.mjs                    prebuild guard

.github/workflows/backup.yml              weekly pg_dump → GH artifact (Sundays 04:00 UTC, 90-day retention)
supabase/migrations/0001–0015.sql         see § Migrations below
scrapers/                                 Node 22 subproject (out/ and cache/ gitignored)
```

## Caching / egress

Supabase egress is the dominant cost constraint. Three layers of caching, top to bottom:

**1. Map data — static-baked at build time.**
`scripts/build-geojson.ts` runs from `prebuild` and writes `public/{facilities,cloud-regions}.geojson` (null-stripped, ~1.9 MB + 41 KB). The homepage `fetch("/facilities.geojson")` hits the Vercel CDN. **Runtime function never touches Supabase for map data.** Old `/api/{facilities,cloud-regions}.geojson` route handlers were deleted. Cache headers in `next.config.ts`: `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`.

**2. SSR pages — ISR.**
Every server page used to call `getTheme()` → `cookies()`, forcing dynamic mode and silently disabling the page-level `revalidate` exports. That's been removed (theme is now inline-script + client-side). Per-slug pages (`/facility/[slug]`, `/operators/[slug]`, `/countries/[code]`, `/metros/[slug]`, `/ixps/[slug]`, `/networks/[asn]`, `/density/[tier]`) use `revalidate = 604800` (7d). Index pages use 3600–86400. Sitemap uses 86400.

**3. Data fetches — materialized views + `unstable_cache`.**
The heavy aggregations read from Postgres materialized views (`country_summary`, `operator_summary`, `facility_density`) instead of pulling 6k raw rows and aggregating in JS — single-query 148-row reads instead of 6 paginated calls. Every loader in `lib/*-data.ts`, `lib/operators.ts`, `lib/density.ts` is then wrapped in `unstable_cache(fn, key, { revalidate: 86400, tags: [...] })`. Same for the per-slug data fetches inside `/facility/[slug]`, `/operators/[slug]`, `/countries/[code]`, and `app/sitemap.ts`'s top-facility-slug fetch. **One Supabase pass per (loader, args) per 24h globally** — shared across regions and across every page that calls the same loader. Tags `"data-centers"`, `"networks"`, `"ixes"` for future selective invalidation.

Materialized views are refreshed by `refresh_summary_views()` RPC (concurrent refresh, non-blocking). Ingest scripts call `refreshSummaryViews()` before `triggerRebuild()` after `--apply` so the new build sees fresh counts.

**Refresh cadence.** Every deploy invalidates `unstable_cache`. Ingest scripts call `triggerRebuild()` after `--apply` → pings `VERCEL_DEPLOY_HOOK_URL` → fresh build. A weekly Vercel cron (`vercel.json` → `/api/cron/refresh-geojson`) does the same for slow drift even without an ingest. Without `VERCEL_DEPLOY_HOOK_URL` set (local dev), `triggerRebuild` is a no-op.

**Backup.** `.github/workflows/backup.yml` runs `pg_dump` weekly (Sundays 04:00 UTC), excluding `auth` + `storage` schemas, uploads gzipped artifact (90-day retention). Manual via `workflow_dispatch`. Requires `SUPABASE_DB_URL` repo secret (session pooler URL).

## Migrations summary

`0001–0006` schema + PostGIS + RLS + relationships · `0007` api_keys + anonymous throttle · `0008` subscriptions · `0009` monthly tier quotas · `0010` drop anonymous tier (API auth-only) · `0011` `api_key_usage_daily` (dashboard chart) · `0012` Free 500 → 1,000 · `0013` canonicalize 8 operator string variants · `0014` backfill 34 NULL operators · `0015` anchor quota cycle to signup anniversary (free) / billing period (paid) · `0016` materialized views `country_summary`, `operator_summary`, `facility_density` + `refresh_summary_views()` RPC.

## Build phases (compact)

1. ✅ Static MVP → DB + PeeringDB → more sources (OSM + cloud regions + PeeringDB nets/IXes) → operator-page enrichment
2. ✅ AEO/SEO (Phase 5): `/operators`, `/countries`, FAQ JSON-LD, llms.txt, sitemap, AI-bot allowlist
3. ✅ v1 public API + docs (Phase 5a)
4. ✅ Pivots (Phase 10): `/metros`, `/ixps`, `/networks`, `/density`, `/insights` — multiply data value via additional lenses
5. ✅ Monetization (Phase 5b): GitHub OAuth + per-key monthly quotas + Polar.sh. Tiers: Free 1k · Pro 10k $9.99 (3-day trial) · Team 50k $39.99 (3-day trial) · Enterprise 5M.
6. ✅ Orphan canonicalization (Phase 9): 234 operator-page orphans resolved → 230 new canonicals + 4 late-linked. Iron Mountain shipped via Playwright (23 facilities).
7. ✅ Hyperscale buildings (Phase 11): Google +58, Meta +32. Microsoft deferred.

**Polar.sh chosen over Stripe**: Korean-bank payout + merchant-of-record VAT handling. Fees ~4% + 40¢.

## Workflow

```bash
npm run dev                       # local
npm run build                     # prebuild: check:security + tsx scripts/build-geojson.ts
npm run ingest                    # re-ingest scrapers/out/*.jsonl + triggerRebuild()
npm run audit:quality             # read-only data audit
npm run canonicalize:orphans -- --apply   # --apply triggers Vercel rebuild on success
npm run ingest:ironmountain -- --apply
npm run ingest:google -- --apply
npm run ingest:meta -- --apply
```

`prebuild` uses `tsx --env-file-if-exists=.env.local` so it works both locally (with `.env.local`) and on Vercel (envs in `process.env`). The geojson bake reads only public tables — anon key is enough, no service role needed.

Ingest order in `main()`: cloud regions → PeeringDB facilities → OSM → operator pages → networks → IXes → netfac → ixfac. Idempotent on (slug), (source, source_id), (data_center_id, network_id).

**To add a source**: new JSONL in `scrapers/out/` → migration if schema needs columns → extend `scripts/ingest.ts` or write `scripts/ingest-<source>.ts` → run → update `app/facility/[slug]/page.tsx` if user-facing → update API route + docs if public.

## Coding conventions

- **No comments unless WHY is non-obvious.** Don't narrate WHAT.
- **No backwards-compat shims** for pre-production code.
- **No try/catch** around code that can't fail. Validate only at boundaries.
- **Server Components by default.** `'use client'` only when needed.
- **No event handlers in Server Component props** (Next 16 enforces). Extract to a Client Component.
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
- Light-style tint: `tintLightBase()` overrides `background` + `land*` fill colors on `style.load`. Single constant `LIGHT_BASE_TINT` in `Map.tsx`.

## Env vars

```
# Required
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # ingest + Polar webhook only — runtime allowlist in check-security.mjs
NEXT_PUBLIC_SITE_URL=https://...        # OAuth redirect + Polar success_url; defaults to https://datacenters.world

# Monetization (Phase 5b)
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_WEBHOOK_SECRET=whsec_...
POLAR_PRO_PRODUCT_ID=<prod_id>          # if unset, /dashboard shows "Coming soon"
POLAR_TEAM_PRODUCT_ID=<prod_id>
POLAR_API_BASE=https://api.polar.sh     # optional (sandbox: https://sandbox-api.polar.sh)

# Cache / rebuild orchestration
VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/...
                                        # ingest scripts + /api/cron/refresh-geojson POST here.
                                        # Unset locally → triggerRebuild is a no-op (graceful).
CRON_SECRET=<random 32 bytes>           # Vercel sends Authorization: Bearer $CRON_SECRET on cron invocations
                                        # /api/cron/refresh-geojson gates on this.

# Analytics (optional — site works without)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # eu.i.posthog.com for EU
```

GitHub repo secret (separate, for the backup workflow): `SUPABASE_DB_URL` = Supabase session-pooler connection string.

**PostHog wiring** (`components/PostHog.tsx`): Client-only. `PostHogProvider` initializes on mount, identifies signed-in users via supabaseBrowser `onAuthStateChange`, resets on sign-out. `PostHogPageView` fires `$pageview` on App Router pathname change. Autocapture catches clicks/forms — only one named event: `key_generated`. `person_profiles: "identified_only"` so anonymous traffic doesn't burn the 1M-events/month free quota. **Reverse proxy**: `/ingest/*` rewrites in `next.config.ts` forward to `us-assets.i.posthog.com` + `us.i.posthog.com` so ad-blockers see same-origin traffic.

## Security

RLS on every public table (public-read on data; auth-scoped via `auth.uid()` on `api_keys` + `subscriptions` + `api_key_usage_daily`). CSP/HSTS/X-Frame from `next.config.ts`. CORS open on `/api/v1/*` only (Bearer required). API keys: 256-bit `crypto.randomBytes`, sha256-hashed at rest, plaintext shown once. Polar webhooks: Standard-Webhooks HMAC-SHA256 + 5-min timestamp tolerance + timing-safe compare.

`scripts/check-security.mjs` (also `prebuild`) blocks: `supabaseAdmin` / `SUPABASE_SERVICE_ROLE_KEY` references in runtime code outside the allowlist (`lib/supabase.ts`, `scripts/`, `app/api/webhooks/`), any `NEXT_PUBLIC_*SERVICE_ROLE*` env, any non-extension public table without RLS.

## First-time deploy

One-time setup when standing up a fresh env:

1. Apply migrations `0001–0016` to Supabase
2. Enable GitHub provider in Supabase Auth
3. Register GitHub OAuth app with callback at **Supabase's** `https://<project-ref>.supabase.co/auth/v1/callback` (NOT our `/auth/callback` — Supabase is the OAuth relay)
4. Configure Supabase Auth → URL Configuration: Site URL = `https://datacenters.world`; Redirect URLs allowlist = `http://localhost:3000/**` + `https://datacenters.world/**`
5. Set `NEXT_PUBLIC_SITE_URL` in Vercel
6. Create Pro + Team subscription products in Polar with 3-day trial, no card required
7. Set Polar env vars + redeploy
8. Register webhook `https://datacenters.world/api/webhooks/polar` in Polar with format=Raw, events=`subscription.{created,updated,active,canceled,revoked}`
9. Vercel → Settings → Git → Deploy Hooks: create one for `main`, copy URL → set as `VERCEL_DEPLOY_HOOK_URL` env var. Set `CRON_SECRET` (random 32 bytes). Redeploy.
10. GitHub repo → Settings → Secrets → add `SUPABASE_DB_URL` (Supabase session-pooler conn string) so the weekly backup workflow can dump.

## Out of scope / known limitations

- **PeeringDB spec gap**: tier/year_built ≈ 0%. Operator pages closed power/space partially.
- **Microsoft Azure buildings deferred**: only region-grain published; `cloud_regions` covers it.
- **Coverage gap vs DataCenterMap (~2,600 US missing)**: PeeringDB scope is interconnect-relevant only. Single-tenant enterprise, telco POPs, small colos missing.
- **No interactive mobile map** (intentional — `<MobileHome>` list fallback).
- **No user submissions** — intentional; the dataset is curated/scraped only.
- **No photos / footprints** populated (columns exist).
- **Photorealistic 3D rejected** — stylized only.
- **datacentermap.com / Cloudscene scraping forbidden** by their ToS.

## Monetization roadmap

- **5a ✅**: free public API + docs validated demand
- **5b ✅**: GitHub-OAuth-gated keys + Polar.sh subscriptions
- **5c (future)**: newsletter capture on `/about`; paywall deeper analysis $20–30/mo
- **5d (future)**: sponsored operator profiles ($50–200/facility/year) — verified badge + enhanced page. Inclusion is *never* paid.

**Avoid**: pay-to-list, hard paywall on public map, aggressive lead-gen forms.
