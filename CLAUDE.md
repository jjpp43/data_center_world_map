# Data Center World Map — Project Context

Public map of every known data center on Earth — single Mapbox view with 2D ↔ 3D toggle. Solo project by Junna Park. Default view focuses on the US.

## Current status

Phases 1–11 + 5b (monetization) + 9 (orphan canonicalization + Iron Mountain) shipped. Migrations `0001–0014` applied. Next: user submissions + admin UI (Phase 12).

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

- **TopBar**: `[brand]` `[nav: About · Methodology · API]` `[search]` `[theme]` `[AccountPill]` — AccountPill is solid-white "Sign in →" CTA when signed out, glass "Account ▾" dropdown (Dashboard, Sign out) when signed in. Initial state seeded from `SessionProvider` cookie hint to avoid flash. AccountPill also rendered by `EditorialHeader` so it's visible on `/about`, `/methodology`, `/api`.
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
├── page.tsx                              map (client) + <MobileHome>
├── layout.tsx                            Geist + Geist Mono + WebSite JSON-LD + SessionProvider + PostHog
├── facility/[slug]/page.tsx              SSR detail; FAQ + Place JSON-LD
├── about/page.tsx, methodology/page.tsx
├── api/{page,ApiNav,CodeTabs}.tsx        chapter-style docs (see above)
├── api/v1/{facilities,operators,countries,cloud-regions}/route.ts
├── api/{facilities,cloud-regions}.geojson/route.ts        map-internal
├── api/billing/checkout/route.ts         Polar Checkout session creator
├── api/webhooks/polar/route.ts           signature-verified webhook receiver
├── operators/[slug]/page.tsx             CollectionPage + ItemList JSON-LD
├── countries/[code]/page.tsx
├── metros, ixps, networks, density, insights/...   Phase 10 pivots
├── login/page.tsx                        GitHub OAuth start (server action)
├── auth/{callback,signout}/route.ts      OAuth code exchange + signOut
├── dashboard/{layout,page,KeysClient}.tsx  single dashboard — keys, plan, billing, usage chart
├── sitemap.ts                            ~14k URLs · robots.ts AI-crawler allowlist

proxy.ts                                  root — Bearer auth on /api/v1/*. Next.js 16 renamed middleware → proxy.

components/
├── Map.tsx, TopBar.tsx, SearchBox.tsx, FilterCard.tsx, MapToggle.tsx, Legend.tsx
├── FacilityPanel.tsx, MobileHome.tsx, FirstRunHint.tsx, InfoToggle.tsx, NoTokenBanner.tsx
├── AccountPill.tsx                       Sign in / Account dropdown (used by TopBar + EditorialHeader)
├── SessionProvider.tsx                   cookie-hint context to avoid auth flash
├── PostHog.tsx                           PostHogProvider + PostHogPageView, identify on Supabase auth
└── editorial.tsx                         Stat, RankedRow, SectionHeader, EditorialHeader (renders AccountPill)

lib/
├── supabase.ts                           supabaseServer (anon) + supabaseAdmin (service) + supabaseBrowser
├── supabase-server.ts                    cookie-aware auth client, server-only
├── api-keys.ts                           generateApiKey, hashApiKey, TIER_LIMITS
├── polar.ts                              Polar Checkout + Standard-Webhooks verify (raw fetch)
├── api.ts, types.ts, url-state.ts, theme.ts, countries.ts
└── operators.ts, countries-data.ts, metros-data.ts, ixps-data.ts, networks-data.ts, density.ts, insights-data.ts

scripts/
├── ingest.ts                             reads scrapers/out/*.jsonl → upserts
├── ingest-{ironmountain,google,meta}.ts  per-source ingest (Mapbox geocode + strict matcher)
├── canonicalize-orphans.ts               resolves Phase 9 orphans (strict 3-tier matcher)
├── audit-quality.ts, audit-orphans.ts    read-only audit reports
└── check-security.mjs                    prebuild guard

supabase/migrations/0001–0014.sql         see § Migrations below
scrapers/                                 Node 22 subproject (out/ and cache/ gitignored)
```

## Migrations summary

`0001–0006` schema + PostGIS + RLS + relationships · `0007` api_keys + anonymous throttle · `0008` subscriptions · `0009` monthly tier quotas · `0010` drop anonymous tier (API auth-only) · `0011` `api_key_usage_daily` (dashboard chart) · `0012` Free 500 → 1,000 · `0013` canonicalize 8 operator string variants · `0014` backfill 34 NULL operators.

## Build phases (compact)

1. ✅ Static MVP → DB + PeeringDB → more sources (OSM + cloud regions + PeeringDB nets/IXes) → operator-page enrichment
2. ✅ AEO/SEO (Phase 5): `/operators`, `/countries`, FAQ JSON-LD, llms.txt, sitemap, AI-bot allowlist
3. ✅ v1 public API + docs (Phase 5a)
4. ✅ Pivots (Phase 10): `/metros`, `/ixps`, `/networks`, `/density`, `/insights` — multiply data value via additional lenses
5. ✅ Monetization (Phase 5b): GitHub OAuth + per-key monthly quotas + Polar.sh. Tiers: Free 1k · Pro 10k $9.99 (3-day trial) · Team 50k $39.99 (3-day trial) · Enterprise 5M.
6. ✅ Orphan canonicalization (Phase 9): 234 operator-page orphans resolved → 230 new canonicals + 4 late-linked. Iron Mountain shipped via Playwright (23 facilities).
7. ✅ Hyperscale buildings (Phase 11): Google +58, Meta +32. Microsoft deferred.
8. ⏸ User submissions + admin UI (Phase 12).

**Polar.sh chosen over Stripe**: Korean-bank payout + merchant-of-record VAT handling. Fees ~4% + 40¢.

## Workflow

```bash
npm run dev                       # local
npm run build                     # prebuild runs check:security
npm run ingest                    # re-ingest scrapers/out/*.jsonl
npm run audit:quality             # read-only data audit
npm run canonicalize:orphans -- --apply
npm run ingest:ironmountain -- --apply
npm run ingest:google -- --apply
npm run ingest:meta -- --apply
```

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

# Analytics (optional — site works without)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # eu.i.posthog.com for EU
```

**PostHog wiring** (`components/PostHog.tsx`): Client-only. `PostHogProvider` initializes on mount, identifies signed-in users via supabaseBrowser `onAuthStateChange`, resets on sign-out. `PostHogPageView` fires `$pageview` on App Router pathname change. Autocapture catches clicks/forms — only one named event: `key_generated`. `person_profiles: "identified_only"` so anonymous traffic doesn't burn the 1M-events/month free quota. **Reverse proxy**: `/ingest/*` rewrites in `next.config.ts` forward to `us-assets.i.posthog.com` + `us.i.posthog.com` so ad-blockers see same-origin traffic.

## Security

RLS on every public table (public-read on data; auth-scoped via `auth.uid()` on `api_keys` + `subscriptions` + `api_key_usage_daily`). CSP/HSTS/X-Frame from `next.config.ts`. CORS open on `/api/v1/*` only (Bearer required). API keys: 256-bit `crypto.randomBytes`, sha256-hashed at rest, plaintext shown once. Polar webhooks: Standard-Webhooks HMAC-SHA256 + 5-min timestamp tolerance + timing-safe compare.

`scripts/check-security.mjs` (also `prebuild`) blocks: `supabaseAdmin` / `SUPABASE_SERVICE_ROLE_KEY` references in runtime code outside the allowlist (`lib/supabase.ts`, `scripts/`, `app/api/webhooks/`), any `NEXT_PUBLIC_*SERVICE_ROLE*` env, any non-extension public table without RLS.

## First-time deploy

One-time setup when standing up a fresh env:

1. Apply migrations `0001–0014` to Supabase
2. Enable GitHub provider in Supabase Auth
3. Register GitHub OAuth app with callback at **Supabase's** `https://<project-ref>.supabase.co/auth/v1/callback` (NOT our `/auth/callback` — Supabase is the OAuth relay)
4. Configure Supabase Auth → URL Configuration: Site URL = `https://datacenters.world`; Redirect URLs allowlist = `http://localhost:3000/**` + `https://datacenters.world/**`
5. Set `NEXT_PUBLIC_SITE_URL` in Vercel
6. Create Pro + Team subscription products in Polar with 3-day trial, no card required
7. Set Polar env vars + redeploy
8. Register webhook `https://datacenters.world/api/webhooks/polar` in Polar with format=Raw, events=`subscription.{created,updated,active,canceled,revoked}`

## Out of scope / known limitations

- **PeeringDB spec gap**: tier/year_built ≈ 0%. Operator pages closed power/space partially.
- **Microsoft Azure buildings deferred**: only region-grain published; `cloud_regions` covers it.
- **Coverage gap vs DataCenterMap (~2,600 US missing)**: PeeringDB scope is interconnect-relevant only. Single-tenant enterprise, telco POPs, small colos missing.
- **No interactive mobile map** (intentional — `<MobileHome>` list fallback).
- **No user submissions / admin yet** (Phase 12).
- **No photos / footprints** populated (columns exist).
- **Photorealistic 3D rejected** — stylized only.
- **datacentermap.com / Cloudscene scraping forbidden** by their ToS.

## Monetization roadmap

- **5a ✅**: free public API + docs validated demand
- **5b ✅**: GitHub-OAuth-gated keys + Polar.sh subscriptions
- **5c (future)**: newsletter capture on `/about`; paywall deeper analysis $20–30/mo
- **5d (future)**: sponsored operator profiles ($50–200/facility/year) — verified badge + enhanced page. Inclusion is *never* paid.

**Avoid**: pay-to-list, hard paywall on public map, aggressive lead-gen forms.
