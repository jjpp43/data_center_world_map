# Data Center World Map — Project Context

Public map of every known data center on Earth — single Mapbox view with 2D ↔ 3D toggle. Solo project by Junna Park. Default view: US, dark, globe.

## Current status

Phases 1–11 shipped. Migrations `0001–0016` applied. No user submissions — curated/scraped dataset only.

- **5,675** facilities · **34,732** networks · **1,309** IXPs · **176** cloud regions · **57,206** net↔fac · **4,134** ix↔fac
- Sources: PeeringDB 5,256 · OSM-only 95 · operator pages 230 · Iron Mountain 4+19 · Google 58 · Meta 32. Microsoft deferred (region-grain only).
- Fill rates: T1 fields 100% · `power_mw` 2.4% · `space_sqft` 9.7% · `year_built` 0.7% · `pue` 1.3%.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, TS strict, Tailwind v4 |
| Fonts | Geist Sans + **Geist Mono** (Mono for all numerics) |
| Map | Mapbox GL JS 3.8+ — `setProjection('globe'\|'mercator')` |
| DB | Supabase Postgres + PostGIS |
| Hosting | Vercel, edge-cached, CSP/HSTS/X-Frame in `next.config.ts` |
| Scrapers | Separate Node 22 subproject. Playwright for Vercel-checkpoint sites |
| Analytics | PostHog Cloud, client-only, proxied via `/ingest/*` |
| Security | `npm run check:security` (also `prebuild`) |

## Data model

```
data_centers (5,675)          ← canonical
  ├→ source_records           ← N:1, raw payload kept
  ├→ networks_at_facility →   networks (34,732 ASNs)
  └→ ixes_at_facility    →    ixes (1,309 IXPs)
cloud_regions (176)           ← separate table, separate map layer
api_keys, subscriptions, api_key_usage_daily   ← auth-scoped via RLS
```

**Dedup primitive**: `match_data_center(operator, name, lat, lng, radius_m)` — exact `(operator, name)` OR PostGIS `ST_DWithin`. **Warning**: spatial branch matches *across operators* — OK for first ingest, **wrong** for orphan/Iron Mountain/hyperscale canonicalization. Those use a 3-tier strict matcher (exact name → `operator ILIKE 'X%' AND name ILIKE 'Y%'` → operator+code regex, no spatial). See `scripts/canonicalize-orphans.ts` and `scripts/ingest-*.ts`.

## UI

Full-bleed map (desktop). Below `md`: `<MobileHome>` search-first list (no interactive mobile map by design). Dark default, light theme via `dcw-theme` cookie.

**Theme**: inline pre-paint script in `app/layout.tsx` toggles `.dark` on `<html>` before hydration. Home page keeps `classList` in sync after hydration. Server pages don't read the cookie — that's what enables ISR.

**SEO (homepage)**: Mapbox canvas has no crawlable text, so `app/page.tsx` includes an `sr-only` `<h1>` + paragraph with both "data centers" and "data centres" spellings. Invisible to users, fully crawlable. Metadata `keywords` + description in `app/layout.tsx` also include British spellings. Don't remove.

- **TopBar**: brand · [About · Methodology · API] · search · theme · AccountPill. AccountPill = solid-white "Sign in →" when out, glass "Account ▾" dropdown when in. `SessionProvider` seeds state from Supabase auth cookie client-side (lazy `useState`) to avoid flash. AccountPill also rendered by `EditorialHeader`.
- **FilterCard** (top-left): operator + country multi-selects, cloud focus chips. Power/status filters removed (status 100% op; power 2.4%).
- **MapToggle** (top-right) · **Legend** (bottom-left pill) · **FirstRunHint** (one-shot via localStorage).
- **Marker click** → 400px right-slide `FacilityPanel` → `/facility/[slug]`.
- **Cloud region click** → Mapbox popup.

**Map light style** is tinted at runtime by `tintLightBase()` in `components/Map.tsx` — `background` + `land*` fills overridden to `#e7eaf0` so the basemap reads distinct from white overlays. Dark style untouched.

**Overlays** all use `bg-white/95` + `border-zinc-300/80` in light mode.

**Marker density scaling**: radius +0–8px from `network_count`, glow opacity 0.35→0.92, `circle-sort-key: network_count`. Cluster glow scales by `clusterProperties.sum_networks`.

**Cloud colors**: AWS `#ff9d2e` · GCP `#a855f7` · Azure `#3aa0e6` · Oracle `#ff5757`.

## Editorial design system

`/about`, `/methodology`, `/api`, `/operators/`, `/countries/`, `/insights/` share vocabulary. Primitives in `components/editorial.tsx`: `<Stat>`, `<MatrixRow>`, `<Source>`, `<Gap>`, `<RankedRow>`, `<EditorialHeader>`.

- Floating-glass cards (`backdrop-blur-md` + semi-transparent + subtle indigo glow)
- Geist Mono numerics
- **Color semantics**: indigo = decorative/inputs · emerald = live/verified/outputs · blue = interactive · amber = pending/incomplete

## URL state

`lib/url-state.ts`: `?op=Equinix&country=US,GB&q=<slug>&theme=light&map=2d&clouds=0&focus=aws`. Default: `country=US`, dark, globe, clouds on. **Do not** add per-pan bbox queries.

## Public API (v1)

Read-only REST, **Bearer auth required**, open CORS, edge-cached. HTML pages stay public — only JSON/CSV gated.

| Endpoint | Returns |
|---|---|
| `/api/v1/facilities` | List (country, operator, min_power_mw, status, limit, offset, format) |
| `/api/v1/facilities/{slug}` | Detail w/ specs, networks, IXPs, sources |
| `/api/v1/operators` | Ranked by facility count + country breadth |
| `/api/v1/countries` | All 148 countries with counts |
| `/api/v1/cloud-regions` | Filterable by provider + country |

Helpers in `lib/api.ts`: `jsonResponse`, `csvResponse`, `errorResponse`, `preflight`. Cache: list=5min, detail/aggregate=1hr, all `stale-while-revalidate`.

**Auth gate** (`proxy.ts`, matches `/api/v1/:path*`): no Bearer → 401. Valid Bearer → `validate_and_charge_api_key` RPC (SECURITY DEFINER, atomic month-rollover + charge + per-day rollup), sets `X-RateLimit-{Tier,Limit,Remaining}`. Over quota → 429. Web Crypto SHA-256 → works in Edge or Node.

**Tiers (monthly)**: Free 1,000 · Pro 10,000 ($9.99) · Team 50,000 ($39.99) · Enterprise 5M. Both paid tiers ship 3-day trial. **Sync invariant**: quotas live in `lib/api-keys.ts` AND migration 0012's `validate_and_charge_api_key` CASE — must match.

**Docs at `/api`**: chapter-style with sticky sidebar, scroll-spy (IntersectionObserver), JS/Python/cURL tabs, response field tables. Files: `app/api/{page,ApiNav,CodeTabs}.tsx`.

## Project layout

```
app/
├── page.tsx                       map (client) + sr-only SEO H1/p + <MobileHome>
├── layout.tsx                     Geist + WebSite JSON-LD + inline theme script + SessionProvider + PostHog
├── facility/[slug]/page.tsx       SSR detail (ISR 7d, unstable_cache per slug); FAQ + Place JSON-LD
├── about, methodology, api/...    editorial (ISR)
├── api/v1/{facilities,operators,countries,cloud-regions}/route.ts
├── api/billing/checkout/route.ts  Polar Checkout
├── api/webhooks/polar/route.ts    signature-verified receiver
├── api/cron/refresh-geojson/...   weekly cron → Deploy Hook
├── operators, countries, metros, ixps, networks, density, insights/...  (ISR 7d per-slug)
├── login, auth/{callback,signout}/route.ts   GitHub OAuth
├── dashboard/...                  keys / plan / billing / usage chart
├── sitemap.ts                     ~900 URLs (capped per type). Long-tail still resolves.
proxy.ts                           Bearer auth on /api/v1/* (Next 16: middleware → proxy)
vercel.json                        weekly cron (Sundays 03:00 UTC)
public/{facilities,cloud-regions}.geojson    baked at build (gitignored)

components/  Map, TopBar, SearchBox, FilterCard, MapToggle, Legend, FacilityPanel,
             MobileHome, FirstRunHint, InfoToggle, NoTokenBanner, AccountPill,
             SessionProvider, PostHog, editorial

lib/  supabase (server/admin/browser), supabase-server (cookie-aware),
      api-keys (TIER_LIMITS), polar (Standard-Webhooks verify), api, types,
      url-state, countries, operators, *-data, density, insights-data
      → all heavy loaders wrapped in unstable_cache (24h, tags data-centers/networks/ixes)

scripts/  ingest, ingest-{ironmountain,google,meta}, canonicalize-orphans,
          build-geojson (prebuild), _trigger-rebuild, audit-quality,
          audit-orphans, check-security.mjs

.github/workflows/backup.yml       weekly pg_dump → GH artifact (Sundays 04:00 UTC)
supabase/migrations/0001–0016.sql
scrapers/                          Node 22 subproject
```

## Caching / egress

Supabase egress is the dominant cost constraint. Three layers:

**1. Map data → static-baked.** `scripts/build-geojson.ts` runs from `prebuild`, writes `public/{facilities,cloud-regions}.geojson` (~1.9 MB + 41 KB). Homepage fetches CDN-only. Runtime function never touches Supabase for map data. Headers: `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`.

**2. SSR pages → ISR.** Per-slug pages (`/facility`, `/operators`, `/countries`, `/metros`, `/ixps`, `/networks`, `/density`) use `revalidate = 604800` (7d). Index pages 3600–86400. Sitemap 86400. **Invariant**: no `getTheme()`/`cookies()` in server pages — that silently disables `revalidate`.

**3. Data fetches → materialized views + `unstable_cache`.** Aggregations read from `country_summary`, `operator_summary`, `facility_density` (single 148-row read instead of paginated raw scans). Every loader in `lib/*-data.ts` + `lib/operators.ts` + `lib/density.ts` wrapped in `unstable_cache(fn, key, { revalidate: 86400, tags: [...] })`. Same for per-slug data fetches in `/facility/[slug]`, `/operators/[slug]`, `/countries/[code]`, and sitemap. **One Supabase pass per (loader, args) per 24h globally.** Tags: `data-centers`, `networks`, `ixes`.

Matviews refreshed by `refresh_summary_views()` RPC (concurrent). Ingest scripts call it before `triggerRebuild()` after `--apply`.

**Refresh cadence**: every deploy invalidates `unstable_cache`. Ingest `--apply` → `triggerRebuild()` → `VERCEL_DEPLOY_HOOK_URL`. Weekly Vercel cron does the same for drift. Unset locally → `triggerRebuild` is a no-op.

**Backup**: `.github/workflows/backup.yml` weekly `pg_dump` (Sundays 04:00 UTC), 90-day retention. Needs `SUPABASE_DB_URL` repo secret (session-pooler URL).

## Migrations summary

`0001–0006` schema + PostGIS + RLS · `0007` api_keys + anon throttle · `0008` subscriptions · `0009` monthly quotas · `0010` drop anon tier (API auth-only) · `0011` `api_key_usage_daily` · `0012` Free 500→1,000 · `0013` canonicalize 8 operator variants · `0014` backfill 34 NULL operators · `0015` anchor quota cycle (signup anniversary free / billing period paid) · `0016` matviews + `refresh_summary_views()`.

## Build phases (history)

1–11 ✅: MVP → DB+PeeringDB → OSM/cloud regions/nets/IXes → operator pages → AEO/SEO (5) → public API+docs (5a) → monetization (5b: Polar.sh) → orphan canonicalization (9) → pivots (10: metros/ixps/networks/density/insights) → hyperscale buildings (11: Google+58, Meta+32). **Polar over Stripe**: KR-bank payout + merchant-of-record VAT. Fees ~4% + 40¢.

## Workflow

```bash
npm run dev
npm run build                                   # prebuild: check:security + build-geojson
npm run ingest                                  # re-ingest scrapers/out/*.jsonl + triggerRebuild
npm run audit:quality
npm run canonicalize:orphans -- --apply
npm run ingest:{ironmountain,google,meta} -- --apply
```

`prebuild` uses `tsx --env-file-if-exists=.env.local` (works locally + Vercel). Geojson bake reads public tables only — anon key enough.

Ingest order: cloud regions → PeeringDB facilities → OSM → operator pages → networks → IXes → netfac → ixfac. Idempotent on `(slug)`, `(source, source_id)`, `(data_center_id, network_id)`.

**Add a source**: JSONL in `scrapers/out/` → migration if needed → extend `scripts/ingest.ts` or write `scripts/ingest-<source>.ts` → update facility page + API docs if user-facing.

## Coding conventions

- **No comments unless WHY is non-obvious.**
- **No backwards-compat shims** for pre-production code.
- **No try/catch** around code that can't fail. Validate only at boundaries.
- **Server Components by default.** `'use client'` only when needed.
- **No event handlers in Server Component props** (Next 16 enforces). Extract a Client Component.
- **No co-author lines in commits.**
- **No emojis in code** unless asked.

## Mapbox notes (v3.8+)

- `setProjection('globe'|'mercator')` — no reinit
- After `setStyle()`, custom layers re-added on `'style.load'`. Use a `dataRef` (closures capture stale data).
- Skip initial `setStyle` on mount (`lastStyleRef` pattern) — constructor already set it; redundant call races style.load → flicker.
- Glow layers added *before* center layers → render behind.
- `circle-sort-key` (layout): higher = on top, within layer.
- `clusterProperties`: `{ sum_networks: ["+", ["coalesce", ["get", "network_count"], 0]] }`
- **Expression gotcha**: `["zoom"]` is only a top-level input to `interpolate`/`step`. For zoom+property scaling, nest interpolates.
- Light tint: `tintLightBase()` overrides `background` + `land*` on `style.load`. Constant `LIGHT_BASE_TINT` in `Map.tsx`.

## Env vars

```
# Required
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # ingest + Polar webhook only — see check-security allowlist
NEXT_PUBLIC_SITE_URL=https://datacenters.world

# Monetization
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_WEBHOOK_SECRET=whsec_...
POLAR_PRO_PRODUCT_ID=...                # if unset, /dashboard shows "Coming soon"
POLAR_TEAM_PRODUCT_ID=...
POLAR_API_BASE=https://api.polar.sh     # optional (sandbox URL for testing)

# Cache / rebuild orchestration
VERCEL_DEPLOY_HOOK_URL=...              # ingest + cron POST here. Unset → triggerRebuild no-op.
CRON_SECRET=...                         # gates /api/cron/refresh-geojson (Vercel adds Bearer)

# Analytics (optional)
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

GitHub repo secret (for backup workflow only): `SUPABASE_DB_URL` = session-pooler URL.

**PostHog wiring** (`components/PostHog.tsx`): client-only. Identifies signed-in users via supabaseBrowser `onAuthStateChange`. Autocapture on; one named event: `key_generated`. `person_profiles: "identified_only"` to stay under free-tier event quota. **Reverse proxy** `/ingest/*` → `us-assets.i.posthog.com` + `us.i.posthog.com` so ad-blockers see same-origin.

## Security

RLS on every public table (public-read on data; auth-scoped via `auth.uid()` on `api_keys`/`subscriptions`/`api_key_usage_daily`). CSP/HSTS/X-Frame in `next.config.ts`. CORS open on `/api/v1/*` only (Bearer required). API keys: 256-bit `randomBytes`, sha256 at rest, plaintext shown once. Polar webhooks: Standard-Webhooks HMAC-SHA256 + 5-min timestamp tolerance + timing-safe compare.

`scripts/check-security.mjs` (prebuild) blocks: `supabaseAdmin`/`SUPABASE_SERVICE_ROLE_KEY` outside allowlist (`lib/supabase.ts`, `scripts/`, `app/api/webhooks/`), any `NEXT_PUBLIC_*SERVICE_ROLE*`, any non-extension public table without RLS.

## First-time deploy

1. Apply migrations `0001–0016`
2. Enable GitHub provider in Supabase Auth
3. Register GitHub OAuth app → callback at **Supabase's** `https://<ref>.supabase.co/auth/v1/callback` (not our `/auth/callback`)
4. Supabase Auth → URL Configuration: Site URL = prod, allowlist `localhost:3000/**` + `datacenters.world/**`
5. Set `NEXT_PUBLIC_SITE_URL` in Vercel
6. Create Pro + Team products in Polar (3-day trial, no card)
7. Set Polar env vars + redeploy
8. Register Polar webhook → `/api/webhooks/polar`, format=**Raw**, events `subscription.{created,updated,active,canceled,revoked}`
9. Vercel → Git → Deploy Hooks (main) → set as `VERCEL_DEPLOY_HOOK_URL`. Set `CRON_SECRET` (32 random bytes). Redeploy.
10. GitHub repo → Secrets → `SUPABASE_DB_URL` (session-pooler URL) for backup workflow.

## Out of scope / known limitations

- PeeringDB spec gap: tier/year_built ≈ 0%. Operator pages closed power/space partially.
- Microsoft Azure buildings deferred: only region-grain published.
- Coverage gap vs DataCenterMap (~2,600 US missing): PeeringDB scope is interconnect-relevant only.
- No interactive mobile map (intentional — `<MobileHome>` list fallback).
- No user submissions (intentional).
- No photos / footprints populated (columns exist).
- Photorealistic 3D rejected — stylized only.
- datacentermap.com / Cloudscene scraping forbidden by ToS.

## Monetization roadmap

- 5a ✅ free API + docs (validated demand)
- 5b ✅ GitHub OAuth + Polar.sh subscriptions
- 5c (future) newsletter capture + paywall deeper analysis $20–30/mo
- 5d (future) sponsored operator profiles ($50–200/facility/year — verified badge). **Inclusion is never paid.**

**Avoid**: pay-to-list, hard paywall on public map, aggressive lead-gen forms.

## Open improvements

**Performance / cost**
- `unstable_cache`-wrap `/api/v1/*` handlers — currently only edge-cached per region; would give one global Supabase pass per (query, TTL). Add `revalidateTag` to post-ingest path.
- Vector tiles (.mvt) for map data — 5–10× smaller payload, but needs `pg_tileserv` or build-time tile gen.
- Pre-generate facility OG images at build (top-500).

**SEO**
- `noindex` long-tail per-slug pages (anything outside the sitemap caps). Stops Google indexing 15k+ low-value URLs while keeping pages reachable. Single helper `lib/indexable.ts` keyed off the same thresholds as `sitemap.ts`.

**Growth / monetization**
- 5c-1: newsletter capture on `/about` (Resend / Buttondown).
- 5c-2: paywall `/insights/*` deeper reports.
- 5d: sponsored profiles (`data_centers.verified` exists).

**Data coverage**
- More operator-page scrapers: Aligned, Stack, Compass, T5, Sabey, Switch, Vantage, H5, Element Critical.
- Revisit Microsoft Azure buildings annually.
- Photos / footprints (Mapillary, StreetView, operator press).

**Product polish**
- Account deletion in dashboard (GDPR).
- API quota alerts (80%/100%) via Resend + daily cron.
- API key rotation flow (overlap window).
- Dashboard: top endpoints by usage (needs `endpoint` column on `api_key_usage_daily`).

**Operations / DX**
- Error monitoring (Sentry free tier or PostHog).
- Typed Supabase client: `npx supabase gen types typescript` → drop hand-rolled `<Row>` interfaces.
- Auto-refresh matviews on Supabase pg_cron as safety net.
