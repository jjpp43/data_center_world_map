# Data Center World Map — Project Context

Public map of every known data center on Earth — single Mapbox view, 2D ↔ 3D toggle. Solo project by Junna Park. Default view: US, dark, globe. **Canonical host is `www.datacenters.world`** — apex 308s to it (raw curl needs `-L --post308`, or hit `www.` directly).

## Current status

Phases 1–14 shipped. Migrations `0001–0018` applied. No user submissions — curated/scraped only. **Pivot in progress** (see `ROADMAP.md`): MCP distribution → narrow tools → B2B licensing. API stays live as upsell, not headline.

- **5,675** facilities · **34,732** networks · **1,309** IXPs · **176** cloud regions · **57,206** net↔fac · **4,134** ix↔fac
- Sources: PeeringDB 5,256 · OSM-only 95 · operator pages 230 · Iron Mountain 4+19 · Google 58 · Meta 32. Microsoft deferred (region-grain only).
- Fill rates: T1 100% · `power_mw` 2.4% · `space_sqft` 9.7% · `year_built` 0.7% · `pue` 1.3%.

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
| AI access | MCP at `/api/mcp` via `mcp-handler` + `@modelcontextprotocol/sdk` + `zod` |
| Security | `npm run check:security` (also `prebuild`) |

## Data model

```
data_centers (5,675)          ← canonical
  ├→ source_records           ← N:1, raw payload kept
  ├→ networks_at_facility →   networks (34,732 ASNs)
  └→ ixes_at_facility    →    ixes (1,309 IXPs)
cloud_regions (176)           ← separate table + map layer
api_keys, subscriptions, api_key_usage_daily   ← auth-scoped via RLS
```

**Dedup**: `match_data_center(operator, name, lat, lng, radius_m)` — exact `(operator, name)` OR PostGIS `ST_DWithin`. **Warning**: spatial branch matches *across operators* — OK for first ingest, **wrong** for orphan/Iron Mountain/hyperscale canonicalization, which use a 3-tier strict matcher (exact name → operator+name prefix → operator+code regex, no spatial). See `scripts/canonicalize-orphans.ts`, `scripts/ingest-*.ts`.

## UI

Full-bleed map (desktop). Below `md`: `<MobileHome>` search-first list (no interactive mobile map by design). Dark default, light via `dcw-theme` cookie. Favicon `app/icon.png` (512×512 🚀, auto-emitted).

**Theme**: inline pre-paint script in `app/layout.tsx` toggles `.dark` on `<html>` before hydration; home page keeps `classList` in sync after. Server pages don't read the cookie — that's what enables ISR.

**Hydration invariant**: `<html suppressHydrationWarning>` so React 19 doesn't strip the bootstrap `.dark` class as a mismatch. Editorial nav (`EditorialHeader` in `components/editorial.tsx`) uses `next/link` `<Link>`, **not** raw `<a href>` — raw `<a>` full-reloads, re-runs the bootstrap, races hydration → light-mode flash on second nav click. Both are load-bearing together.

**SEO — homepage**: Mapbox canvas has no crawlable text, so `app/page.tsx` has an `sr-only` `<h1>` + paragraph with both "data centers" and "data centres". `keywords`/description in `app/layout.tsx` also carry British spellings. Don't remove.

**SEO — per-slug titles**: numeric-lead pattern, count + scope in first ~50 chars (survives mobile SERP truncation); descriptions lead with the number. E.g. `Germany Data Centers — All 359 Facilities (Free Map)`, `Equinix LD8 (London) — Specs, Power, Networks, IXPs`. CTR-tuned — don't revert to generic templates.

**SEO — structured data + internal links**:
- `WebSite`/`Organization`/`Dataset` JSON-LD in `app/layout.tsx`; `Place` + `FAQPage` on facility pages; `CollectionPage` on operator/country/metro.
- `BreadcrumbList` JSON-LD on every per-slug page (facility/operator/country/metro). Absolute `item` URLs.
- Facility `Place` JSON-LD `@id`/`url` are **absolute** (`${SITE}/...`) — `metadataBase` does NOT apply to hand-injected JSON-LD, only to `alternates`/`openGraph`.
- Facility pages link operator (`/operators/${operatorSlug}`) + country (`/countries/${countrySlug}`) inline — derived from the loaded payload, no extra query/ISR write. Keeps ~5.6k head pages feeding PageRank into hubs.
- All `<script>` JSON-LD goes through `jsonForHtml()` (see Security).

**Chrome**:
- **TopBar**: brand · [About · Methodology · API] · search · theme · AccountPill. AccountPill = solid-white "Sign in →" out, glass "Account ▾" dropdown in. `SessionProvider` seeds from Supabase auth cookie client-side (lazy `useState`) to avoid flash. Also rendered by `EditorialHeader`.
- **FilterCard** (top-left): operator + country multi-selects, cloud focus chips. Power/status filters removed (status 100% op, power 2.4%).
- **MapToggle** (top-right) · **Legend** (bottom-left) · **FirstRunHint** (one-shot via localStorage).
- Marker click → 400px right-slide `FacilityPanel` → `/facility/[slug]`. Cloud region click → Mapbox popup.

**Map styling**: `tintLightBase()` in `components/Map.tsx` overrides `background` + `land*` fills to `#e7eaf0` (const `LIGHT_BASE_TINT`) so basemap reads distinct from white overlays; dark untouched. Overlays use `bg-white/95` + `border-zinc-300/80` in light. **Marker density**: radius +0–8px from `network_count`, glow 0.35→0.92, `circle-sort-key: network_count`; cluster glow scales by `clusterProperties.sum_networks`.

**Cloud colors**: AWS `#ff9d2e` · Google `#a855f7` · Azure `#3aa0e6` · Oracle `#ff5757`. **Display label is "Google"** everywhere user-facing; wire value stays `gcp` (DB key + API param + URL state + MCP enum).

## Editorial design system

`/about`, `/methodology`, `/api`, `/operators/`, `/countries/`, `/insights/` share vocabulary. Primitives in `components/editorial.tsx`: `<Stat>`, `<MatrixRow>`, `<Source>`, `<Gap>`, `<RankedRow>`, `<EditorialHeader>`. Floating-glass cards (`backdrop-blur-md` + semi-transparent + indigo glow), Geist Mono numerics. **Color semantics**: indigo = decorative/inputs · emerald = live/verified/outputs · blue = interactive · amber = pending/incomplete.

## URL state

`lib/url-state.ts`: `?op=Equinix&country=US,GB&q=<slug>&theme=light&map=2d&clouds=0&focus=aws`. Default `country=US`, dark, globe, clouds on. **Do not** add per-pan bbox queries.

## Public API (REST v1 + MCP)

Read-only, two surfaces, **same Bearer auth + per-key monthly quota across both**, open CORS. HTML pages stay public — only JSON/CSV/MCP-tool-calls are gated.

| Endpoint | Returns |
|---|---|
| `/api/v1/facilities` | List (country, operator, min_power_mw, status, limit, offset, format) |
| `/api/v1/facilities/{slug}` | Detail w/ specs, networks, IXPs, sources |
| `/api/v1/operators` | Ranked by facility count + country breadth |
| `/api/v1/countries` | All 148 countries with counts |
| `/api/v1/cloud-regions` | Filterable by provider + country |
| `/api/mcp` | Streamable HTTP MCP — 5 tools (search_facilities, get_facility, list_operators, list_countries, list_cloud_regions) |

- **Shared data layer** (`lib/api-data.ts`): `unstable_cache` loaders imported by both REST handlers AND MCP tools. Keys versioned `api-v1-<endpoint>-v1` — bump on response-shape change. `data-centers` tag invalidation. One global Supabase pass per (loader, args) per 24h across REST + MCP + page renders.
- **Cache-Control on `/api/v1/*` is `private, max-age=<N>, must-revalidate`** — `public` let the CDN cache per-user `X-RateLimit-*` headers and leak across keys.
- Helpers in `lib/api.ts`: `jsonResponse`, `csvResponse`, `errorResponse`, `internalError`, `preflight`.
- **Auth gate** (`proxy.ts`, matches `/api/v1/:path*` + `/api/mcp`): no Bearer → 401. Valid → `validate_and_charge_api_key` RPC, sets `X-RateLimit-{Tier,Limit,Remaining}`. Over quota → 429. **Per-instance negative-token cache (60s TTL, 1024 cap)** short-circuits known-invalid hashes so token-spray doesn't amplify Supabase egress. Web Crypto SHA-256 (Edge or Node).
- **Tiers (monthly)**: Free 1,000 · Pro 10,000 ($9.99) · Team 50,000 ($39.99) · Enterprise 5M. Paid tiers ship 3-day trial. **Sync invariant**: quotas in `lib/api-keys.ts` AND `validate_and_charge_api_key` CASE (migrations 0012/0017) must match.
- **MCP config**: `{"mcpServers":{"datacenters-world":{"url":"https://www.datacenters.world/api/mcp","headers":{"Authorization":"Bearer dcw_…"}}}}`. Each tool call = 1 charge. Tools in `app/api/[transport]/route.ts`; basePath `/api`, SSE disabled.
- **Docs at `/api`**: chapter-style, sticky sidebar, scroll-spy, JS/Python/cURL tabs. Section 5 = MCP. Files `app/api/{page,ApiNav,CodeTabs}.tsx`. CodeTabs uses clipboard/check icon button. Dashboard mirrors the MCP snippet.

## Project layout

```
app/
├── page.tsx                          map (client) + sr-only SEO H1/p + <MobileHome>
├── layout.tsx                        Geist + WebSite/Organization/Dataset JSON-LD + inline theme + SessionProvider + PostHog. <html suppressHydrationWarning>
├── icon.png                          512×512 favicon
├── facility/[slug]/page.tsx          SSR detail (ISR 7d, per-slug unstable_cache); Place + FAQ + Breadcrumb JSON-LD; links operator+country
├── operators|countries|metros|ixps|networks|density|insights/...  ISR 7d per-slug; Breadcrumb JSON-LD on [slug]
├── about, methodology, api/...       editorial (ISR)
├── api/v1/{facilities,operators,countries,cloud-regions}/route.ts
├── api/[transport]/route.ts          MCP server (5 tools)
├── api/billing/checkout/route.ts     Polar Checkout
├── api/webhooks/polar/route.ts       signature-verified receiver
├── api/cron/refresh-geojson/...      weekly cron → Deploy Hook (fails closed if CRON_SECRET unset)
├── login, auth/{callback,signout}/route.ts   GitHub OAuth (callback safeNext()). login + dashboard = noindex,nofollow
├── dashboard/...                     keys / plan / billing / usage / MCP snippet
├── sitemap.ts                        ~900 URLs (capped per type); long-tail still resolves
proxy.ts                              Bearer auth on /api/v1/* + /api/mcp (Next 16: middleware → proxy)
vercel.json                           weekly cron (Sun 03:00 UTC)
public/{facilities,cloud-regions}.geojson    baked at build (gitignored)

components/  Map, TopBar, SearchBox, FilterCard, MapToggle, Legend, FacilityPanel,
             MobileHome, FirstRunHint, InfoToggle, NoTokenBanner, AccountPill,
             SessionProvider, PostHog, editorial
lib/  supabase (server/admin/browser), supabase-server (cookie-aware), api-keys (TIER_LIMITS),
      polar, api (jsonResponse + internalError + CSV-safe csvResponse), api-data (shared loaders),
      json-ld (jsonForHtml), indexable (sitemap caps + isFacilityIndexable/NOINDEX_ROBOTS),
      types, url-state, countries, operators, *-data, density, insights-data
scripts/  ingest, ingest-{ironmountain,google,meta}, canonicalize-orphans,
          build-geojson (prebuild), _trigger-rebuild, audit-quality, audit-orphans, check-security.mjs
.github/workflows/backup.yml          weekly pg_dump → GH artifact (Sun 04:00 UTC)
supabase/migrations/0001–0018.sql · scrapers/ (Node 22 subproject)
```

## Caching / egress

Supabase egress is the dominant cost. Three layers:

1. **Map data → static-baked.** `scripts/build-geojson.ts` (prebuild) writes `public/{facilities,cloud-regions}.geojson` (~1.9 MB + 41 KB); runtime never touches Supabase for map data. Headers `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`.
2. **SSR pages → ISR.** Per-slug (`/facility`, `/operators`, `/countries`, `/metros`, `/ixps`, `/networks`, `/density`) `revalidate = 604800` (7d). Index 3600–86400. Sitemap 86400. **Invariant**: no `getTheme()`/`cookies()` in server pages — silently disables `revalidate`. Also no `new Date()` in rendered output (module-load `YEAR` const only) — non-deterministic bytes force an ISR write every cycle.
3. **Data fetches → matviews + `unstable_cache`.** Aggregations read `country_summary`, `operator_summary`, `facility_density` (single-row, not paginated scans). Every loader in `lib/*-data.ts` + `operators.ts` + `density.ts` + `api-data.ts` wrapped `unstable_cache(fn, key, { revalidate: 86400, tags })`. Shared by every per-slug render, `/api/v1/*`, and MCP call → one Supabase pass per (loader, args) per 24h. Tags: `data-centers`, `networks`, `ixes`.

Matviews refreshed by `refresh_summary_views()` RPC (concurrent); ingest calls it on `--apply`. **Refresh cadence**: every deploy invalidates `unstable_cache` → fresh ISR write on next hit to every per-slug page (~40k writes/rebuild). So `triggerRebuild()` defaults off, no-ops without `--rebuild` (data lands within 24h via `revalidate`); unset `VERCEL_DEPLOY_HOOK_URL` → no-op regardless. Weekly Vercel cron redeploys to re-bake geojson = steady-state cache-nuke baseline.

**Indexable head vs long-tail** (`lib/indexable.ts`, single source of truth for caps + min-facility thresholds: facilities 500, operators 200, ixps 100, networks 100; `sitemap.ts` imports these): **Facilities are fully indexable** — every real facility page (coords present, `isFacilityIndexable(lat,lng)`) emits `index:true`; the `facilities:500` cap is a *sitemap crawl-budget hint only*, not an index gate. (Reverses commit f9e3832 which noindex'd ~91% of facilities and tanked GSC impressions; `noindex,follow` never saved ISR writes anyway.) `/operators`, `/ixps`, `/networks` still `noindex` genuinely thin pages outside caps via `isIndexable*()` in `generateMetadata`. Countries + metros uncapped. Dashboard + login `noindex,nofollow` (auth-gated).

**Stranded-slug redirects** (`data/facility-slug-redirects.json` → `next.config.ts redirects()`): facility slugs historically baked in the volatile `city` token, so a re-scrape that changed/dropped a city could re-slug a page and strand its already-indexed URL as a 404 (a GSC "Not found (404)" bucket). The JSON maps dead slug → live slug; `next.config.ts` emits them as permanent 308s at the **routing layer** — no function/Supabase/ISR cost, same mechanism as `OPERATOR_ALIASES`. Populate from a GSC 404 export via `npm run reconcile:404 -- --csv <export> [--apply]` (`scripts/reconcile-404s.ts`: matches stranded→live by longest dash-segment prefix, refuses ambiguous guesses, leaves genuinely-deleted facilities as correct 404s). Ingest already preserves an existing facility's slug on match (never re-slugs in place), so this is a catch-up layer for historical strandings + a safety net.

**Backup**: `.github/workflows/backup.yml` weekly `pg_dump` (Sun 04:00 UTC), 90-day retention. Needs `SUPABASE_DB_URL` repo secret (session-pooler).

## Migrations

`0001–0006` schema + PostGIS + RLS · `0007` api_keys + anon throttle · `0008` subscriptions · `0009` monthly quotas · `0010` drop anon tier · `0011` `api_key_usage_daily` · `0012` Free 500→1,000 · `0013` canonicalize 8 operator variants · `0014` backfill 34 NULL operators · `0015` anchor quota cycle (signup-anniversary free / billing-period paid) · `0016` matviews + `refresh_summary_views()` · `0017` `#variable_conflict use_column` in `validate_and_charge_api_key` (OUT `key_id` collided with `api_key_usage_daily.key_id` → silent 401 on every API/MCP call until applied) · `0018` `p_charge boolean default true` so `proxy.ts` validates-without-charging MCP protocol overhead (`initialize`/`tools/list`/`notifications/*`) instead of burning quota per handshake.

## Build phases (history)

1–11 ✅ MVP → DB+PeeringDB → OSM/cloud/nets/IXes → operator pages → AEO/SEO → public API+docs → monetization (Polar.sh, KR-bank payout + MoR VAT, ~4%+40¢) → orphan canonicalization → pivots (metros/ixps/networks/density/insights) → hyperscale buildings (Google+58, Meta+32).
12 ✅ MCP — 5 tools, shares auth/quota/cache with REST.
13 ✅ SEO/AEO — CTR-tuned titles (numeric lead + dual spelling) + Dataset schema.
14 ✅ Security hardening + hydration fix (see Security).

## Workflow

```bash
npm run dev
npm run build                                   # prebuild: check:security + build-geojson
npm run ingest                                  # re-ingest scrapers/out/*.jsonl (add -- --rebuild to deploy)
npm run audit:quality
npm run canonicalize:orphans -- --apply
npm run ingest:{ironmountain,google,meta} -- --apply
```

`prebuild` uses `tsx --env-file-if-exists=.env.local` (local + Vercel); geojson bake reads public tables only (anon key). **Ingest order**: cloud regions → PeeringDB facilities → OSM → operator pages → networks → IXes → netfac → ixfac. Idempotent on `(slug)`, `(source, source_id)`, `(data_center_id, network_id)`. **Add a source**: JSONL in `scrapers/out/` → migration if needed → extend `scripts/ingest.ts` or new `scripts/ingest-<source>.ts` → update facility page + API docs if user-facing.

## Coding conventions

- No comments unless WHY is non-obvious. No backwards-compat shims (pre-production). No try/catch around code that can't fail — validate at boundaries only.
- Server Components by default; `'use client'` only when needed. No event handlers in Server Component props (Next 16 enforces) — extract a Client Component.
- No co-author lines in commits. No emojis in code unless asked.

## Mapbox (v3.8+)

- `setProjection('globe'|'mercator')` — no reinit.
- After `setStyle()`, re-add custom layers on `'style.load'`; use a `dataRef` (closures capture stale data).
- Skip initial `setStyle` on mount (`lastStyleRef` pattern) — constructor already set it; redundant call races style.load → flicker.
- Glow layers added *before* center layers render behind. `circle-sort-key` (layout): higher = on top within layer.
- `clusterProperties`: `{ sum_networks: ["+", ["coalesce", ["get","network_count"], 0]] }`.
- **Expression gotcha**: `["zoom"]` is only a top-level input to `interpolate`/`step`; for zoom+property scaling, nest interpolates.

## Env vars

```
# Required
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
NEXT_PUBLIC_SUPABASE_URL=... · NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # ingest + Polar webhook only — check-security allowlist
NEXT_PUBLIC_SITE_URL=https://datacenters.world
# Monetization
POLAR_ACCESS_TOKEN=polar_oat_... · POLAR_WEBHOOK_SECRET=whsec_...
POLAR_PRO_PRODUCT_ID=...                # unset → /dashboard "Coming soon"
POLAR_TEAM_PRODUCT_ID=... · POLAR_API_BASE=https://api.polar.sh   # optional (sandbox)
# Cache / rebuild
VERCEL_DEPLOY_HOOK_URL=...              # cron + --rebuild POST here. Unset → no-op.
CRON_SECRET=...                         # /api/cron/refresh-geojson. Unset → 500 (fails closed).
# Analytics (optional)
NEXT_PUBLIC_POSTHOG_KEY=phc_... · NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Repo secret (backup only): `SUPABASE_DB_URL` = session-pooler URL.

**PostHog** (`components/PostHog.tsx`): client-only, identifies on supabaseBrowser `onAuthStateChange`. Autocapture on; one named event `key_generated`. `person_profiles: "identified_only"` (free-tier quota). Reverse proxy `/ingest/*` → `us-assets.i.posthog.com` + `us.i.posthog.com` so ad-blockers see same-origin.

## Security

RLS on every public table (public-read on data; auth-scoped via `auth.uid()` on `api_keys`/`subscriptions`/`api_key_usage_daily`). CSP/HSTS/X-Frame in `next.config.ts`. CORS open on `/api/v1/*` + `/api/mcp` (Bearer required). API keys: 256-bit `randomBytes`, sha256 at rest, plaintext shown once. Polar webhooks: Standard-Webhooks HMAC-SHA256 + 5-min tolerance + timing-safe compare. `scripts/check-security.mjs` (prebuild) blocks: `supabaseAdmin`/`SUPABASE_SERVICE_ROLE_KEY` outside allowlist (`lib/supabase.ts`, `scripts/`, `app/api/webhooks/`), any `NEXT_PUBLIC_*SERVICE_ROLE*`, any non-extension public table without RLS.

**Hardening invariants (don't regress)**:
- **JSON-LD**: always `jsonForHtml()` (`lib/json-ld.ts`) for `<script>`-embedded JSON — escapes `<` so scraped values with `</script>` can't break out.
- **CSV**: `escapeCsvCell` in `lib/api.ts` tick-prefixes cells starting `=+-@\t\r` (formula injection).
- **`/api/v1/*` Cache-Control `private`** — `public` leaks per-user `X-RateLimit-*` across keys.
- **Error sanitization**: handlers catch RPC errors → `internalError(scope, e)`; never echo `error.message` (leaks PostgREST internals).
- **Slug gate** on `/api/v1/facilities/[slug]`: regex `[a-z0-9-]{1,100}` rejects junk before any cache/Supabase hit.
- **Open-redirect guard** in `/auth/callback`: `safeNext()` rejects anything not starting `/`, and `//` / `/\`.
- **Cron fails closed**: unset `CRON_SECRET` → 500; constant-time compare.
- **Negative-token cache** in `proxy.ts` (60s, 1024 cap) short-circuits known-invalid Bearer hashes.
- **MCP pre-validation**: `classifyMcpRequest` in `proxy.ts` rejects malformed `/api/mcp` POSTs (bad/missing `Accept`, unparseable body, missing JSON-RPC `method`) with 400/406 before auth + before Supabase — stops quota burn on requests that would 4xx anyway.
- **`<html suppressHydrationWarning>`** + editorial nav `<Link>` (not raw `<a>`) — both required or React 19 strips `.dark` on second nav.
- **CSP `script-src 'unsafe-inline'`** retained (nonces would force dynamic render, break ISR) — now defense-in-depth since JSON-LD XSS is closed at injection via `jsonForHtml()`.

## First-time deploy

1. Apply migrations `0001–0018`.
2. Enable GitHub provider in Supabase Auth; register GitHub OAuth app with callback at **Supabase's** `https://<ref>.supabase.co/auth/v1/callback` (not our `/auth/callback`).
3. Supabase Auth → URL Config: Site URL = prod, allowlist `localhost:3000/**` + `datacenters.world/**`.
4. Set `NEXT_PUBLIC_SITE_URL` in Vercel; create Pro + Team products in Polar (3-day trial, no card); set Polar env + redeploy.
5. Register Polar webhook → `/api/webhooks/polar`, format=**Raw**, events `subscription.{created,updated,active,canceled,revoked}`.
6. Vercel → Git → Deploy Hooks (main) → `VERCEL_DEPLOY_HOOK_URL`. Set `CRON_SECRET` (32 random bytes). Redeploy.
7. GitHub → Secrets → `SUPABASE_DB_URL` (session-pooler) for backup.

## Out of scope / known limitations

- PeeringDB spec gap: tier/year_built ≈ 0% (operator pages closed power/space partially). Microsoft Azure buildings deferred (region-grain only). Coverage gap vs DataCenterMap (~2,600 US missing) — PeeringDB scope is interconnect-relevant only.
- No interactive mobile map, no user submissions, no photos/footprints (columns exist), photorealistic 3D — all intentional.
- datacentermap.com / Cloudscene scraping forbidden by ToS.

## Roadmap / open improvements

- **Monetization**: 5a ✅ free API+docs · 5b ✅ GitHub OAuth + Polar · 5c (future) newsletter + paywall `/insights/*` $20–30/mo · 5d (future) sponsored profiles ($50–200/facility/yr, `verified` badge). **Inclusion never paid.** Avoid pay-to-list, hard paywall on public map, aggressive lead-gen.
- **MCP**: more tools (`find_facilities_near(lat,lng,radius_km)` — PostGIS infra exists, `list_ixps`, `get_network(asn)`); submit to directories (Anthropic catalog, smithery.ai, `modelcontextprotocol/servers`).
- **Perf/cost**: vector tiles (.mvt) for map data (needs `pg_tileserv` or build-time gen); pre-gen facility OG images (top-500). No default OG image yet.
- **Data coverage**: more operator scrapers (Aligned, Stack, Compass, T5, Sabey, Switch, Vantage, H5, Element Critical); revisit Azure annually; photos/footprints (Mapillary, StreetView).
- **Product polish**: account deletion (GDPR); API quota alerts (80/100%) via Resend + cron; key rotation flow; dashboard top-endpoints (needs `endpoint` col on `api_key_usage_daily`).
- **Ops/DX**: error monitoring (Sentry/PostHog); typed Supabase client (`supabase gen types`); auto-refresh matviews via pg_cron.
