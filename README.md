# datacenters.world

An open, sourced map of every serious data center on Earth.

**Live:** _coming soon_

5,351 facilities across 148 countries, with verified specs from PeeringDB, OpenStreetMap, and operator websites. Plus 34,732 networks, 1,309 internet exchanges, and 176 cloud regions. Sourced, deduplicated, and queryable.

## Stack

- **Next.js 16** App Router · TypeScript · Tailwind v4
- **Mapbox GL JS** with 2D ↔ 3D globe toggle, client-side clustering
- **Supabase Postgres + PostGIS** for facility data
- **Vercel** for hosting

## Quick start

```bash
# Install
npm install

# Configure env (.env.local)
cp .env.example .env.local   # then fill in the values below

# Run
npm run dev
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox access token (read-only public token) |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — read-only via RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Required for `npm run ingest`. Never expose to client. |

Don't deploy `SUPABASE_SERVICE_ROLE_KEY` to Vercel production — the website is read-only and doesn't need it.

## Project structure

```
app/                       Next.js App Router pages + API routes
  page.tsx                 Map (client) + mobile list fallback
  about/                   Slim editorial intro page
  methodology/             Long-form inclusion criteria + sources
  facility/[slug]/         Server-rendered facility detail page (5,351 SEO pages)
  api/                     GeoJSON endpoints for facilities + cloud regions

components/                Map + editorial UI + filters

lib/
  supabase.ts              supabaseServer() (anon) + supabaseAdmin() (service)
  theme.ts                 Cookie-based theme persistence
  types.ts                 Facility, CloudRegion, Filters
  url-state.ts             URL ↔ state serialization

scripts/
  ingest.ts                Reads scrapers/out/*.jsonl → Supabase
  check-security.mjs       Prebuild guard against service-role leakage + RLS check

scrapers/                  Separate Node subproject — facility data scrapers
                           (output JSONL files in scrapers/out/ are gitignored)

supabase/migrations/       Sequential SQL migrations (apply via Supabase SQL editor)
```

## Workflows

**Re-ingest from scraper output:**
```bash
npm run ingest
```
Reads all JSONL files in `scrapers/out/` and upserts to Supabase. Idempotent.

**Run security checks:**
```bash
npm run check:security
```
Verifies the service-role key never leaks into client code, no env var is misnamed, and every public table has RLS enabled. Also runs automatically on `next build` (without the RLS check, since Vercel doesn't have the service-role key).

**Add a new operator scraper:**
1. Write `scrapers/<operator>.ts` → emit `scrapers/out/facilities.<operator>.jsonl`
2. Add the source key to the CHECK constraint in a new migration
3. Add an ingest function to `scripts/ingest.ts`
4. Run `npm run ingest`

## Methodology

Inclusion criteria, source breakdown, and known gaps are documented at [/methodology](https://datacenters.world/methodology). See also `CLAUDE.md` for deeper project context (audience: developers and AI assistants working on the codebase).

## License

Code is private. Data is derived from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and operator-published facility pages — original licenses apply to the data.

---

Built by [Junna Park](https://github.com/jjpp43).
