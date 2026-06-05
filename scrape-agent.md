# Data Center Scraping Agent — Brief

## Mission

Collect a comprehensive, deduplicated list of data center facilities and cloud
provider regions from public sources, and emit them as JSONL files matching the
schema below. Your output will be ingested into a Postgres database; **do not
attempt to write to any database yourself.**

## Output

Produce these files in `./out/`:

| File | Contents |
|---|---|
| `facilities.peeringdb.jsonl` | One JSON object per facility from PeeringDB |
| `facilities.osm.jsonl` | One JSON object per facility from OpenStreetMap |
| `cloud_regions.aws.jsonl` | One JSON object per AWS region |
| `cloud_regions.gcp.jsonl` | One JSON object per GCP region |
| `cloud_regions.azure.jsonl` | One JSON object per Azure region |
| `cloud_regions.oracle.jsonl` | One JSON object per Oracle Cloud region |
| `report.md` | Run summary: counts per source, errors, anomalies |

**JSONL** = one JSON object per line, no surrounding array, no commas between
records. Easier to stream-ingest and diff.

## Schema — Facility record

```jsonc
{
  "slug": "equinix-ld8-london",      // kebab-case, deterministic from operator+name+city
  "name": "Equinix LD8",             // REQUIRED
  "operator": "Equinix",
  "campus": null,                    // null if not part of a campus

  "location": {
    "address": "8-9 Harbour Exchange Square",
    "city": "London",
    "region": "England",
    "country": "GB",                 // REQUIRED. ISO-3166-1 alpha-2, uppercase
    "postal_code": "E14 9GE",
    "lat": 51.5012,                  // REQUIRED. WGS84 decimal degrees
    "lng": -0.0167                   // REQUIRED. WGS84 decimal degrees
  },

  "status": "operational",           // REQUIRED. enum:
                                     //   operational | under_construction
                                     //   | planned | decommissioned

  "specs": {
    "power_mw": 12.5,                // megawatts; null if unknown
    "space_sqft": 145000,            // square feet; null if unknown
    "space_sqm": null,
    "tier": "III",                   // I|II|III|IV (Uptime Institute); null otherwise
    "year_built": 2008,
    "cooling": "chilled water",
    "pue": 1.4
  },

  "connectivity": {
    "carriers": ["Lumen", "Zayo"],
    "ixps": ["LINX"],
    "cross_connects": null
  },

  "certifications": ["SOC2", "ISO27001"],

  "media": {
    "photos": [{ "url": "...", "credit": "Equinix", "caption": null }],
    "website": "https://..."
  },

  "footprint": null,                 // GeoJSON Polygon (WGS84) or null

  "sources": [                       // REQUIRED. >=1 entry.
    {
      "source": "peeringdb",         // peeringdb|aws|gcp|azure|oracle|osm|user
      "source_id": "12345",          // upstream primary key (as string)
      "source_url": "https://www.peeringdb.com/fac/12345",
      "fetched_at": "2026-06-01T12:00:00Z",  // ISO 8601 UTC
      "raw": { /* original upstream payload, untouched */ }
    }
  ]
}
```

## Schema — Cloud Region record

```jsonc
{
  "provider": "aws",                 // REQUIRED. aws|gcp|azure|oracle
  "code": "us-east-1",               // REQUIRED. provider's region code
  "name": "US East (N. Virginia)",   // REQUIRED. human-readable
  "city": "Ashburn",
  "country": "US",                   // ISO-3166-1 alpha-2
  "lat": 38.9519,                    // REQUIRED
  "lng": -77.4480,                   // REQUIRED
  "az_count": 6,
  "launched_year": 2006,
  "services": ["compute", "storage"],
  "source_url": "https://aws.amazon.com/..."
}
```

## Field conventions (must follow)

- **Coordinates**: WGS84 decimal degrees, 6 decimals max. `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`. Reject any record outside these bounds.
- **Country**: ISO-3166-1 alpha-2 uppercase (`US`, `GB`, `DE`). Convert long names with a standard library; never invent codes.
- **Timestamps**: ISO 8601 UTC with `Z` suffix. Never local time, never naïve.
- **Slug**: lowercase, ASCII, kebab-case. Formula: `slugify(${operator}-${name}-${city})`. Must be deterministic so re-runs produce the same slug.
- **Unknown values**: use JSON `null`. Never the strings `"unknown"`, `"N/A"`, `""`, or the number `0`.
- **Status enum**: use exact lowercase strings. If a source uses a different word ("live", "active") map it to `"operational"`.
- **`raw` field**: store the original upstream payload as-received. This is the escape hatch for later re-processing.
- **One record per facility**: if you combine data for the same building from two sources, emit a single record with two entries in `sources[]`.

## Sources — what to scrape, where, how

Process sources in the order below. The earlier sources are higher quality.

### 1. PeeringDB (PRIMARY — ~5,000 facilities)

- **Endpoint**: `https://www.peeringdb.com/api/fac`
- **Auth**: none required for read
- **Format**: JSON, paginated via `?limit=250&skip=0` (max limit 250)
- **Rate limit**: ~10 req/sec; add 100ms delay between pages to be polite
- **Field mapping**:

| PeeringDB field | Our field |
|---|---|
| `id` | `sources[0].source_id` (stringify) |
| `name` | `name` |
| `org_name` | `operator` |
| `address1` + `address2` | `location.address` |
| `city` | `location.city` |
| `state` | `location.region` |
| `country` | `location.country` (already ISO-3166-1 alpha-2) |
| `zipcode` | `location.postal_code` |
| `latitude` | `location.lat` |
| `longitude` | `location.lng` |
| `website` | `media.website` |
| `status` (`"ok"` etc.) | map to `status: "operational"` |
| _entire payload_ | `sources[0].raw` |

- **Source URL**: `https://www.peeringdb.com/fac/{id}`
- **Skip rows where** `latitude` or `longitude` is null/0.
- **Expected count**: ~5,000–7,000.

### 2. AWS Regions

- **URL**: `https://aws.amazon.com/about-aws/global-infrastructure/regions_az/`
- **Method**: HTML scrape with cheerio (Node) or BeautifulSoup (Python). The page lists region codes, names, launch year, and AZ counts in a table.
- **Coordinates**: AWS doesn't publish lat/lng. Use the **metro centroid** of the city named in the region (e.g. `us-east-1` → Ashburn, VA → `38.9519, -77.4480`). Maintain a hand-curated `region_code → {city, lat, lng, country}` map in `aws_metros.json` — better than re-geocoding each run.
- **Expected count**: ~33 regions.
- **Source URL**: the same page URL for every region.

### 3. GCP Regions

- **URL**: `https://cloud.google.com/about/locations`
- **Method**: HTML scrape. Google lists region codes, locations (city, country), and launch years.
- **Coordinates**: metro centroid, same approach as AWS. Maintain `gcp_metros.json`.
- **Expected count**: ~40 regions.

### 4. Azure Regions

- **URL**: `https://datacenters.microsoft.com/globe/explore`
  - Backup: `https://azure.microsoft.com/en-us/explore/global-infrastructure/geographies/`
- **Method**: HTML scrape. The "globe" page also loads a JSON of region metadata client-side — check `view-source:` and the Network tab for a JSON endpoint to use instead of HTML parsing.
- **Coordinates**: metro centroid; many Azure regions name the specific city.
- **Expected count**: ~60 regions.

### 5. Oracle Cloud Regions

- **URL**: `https://www.oracle.com/cloud/public-cloud-regions/`
- **Method**: HTML scrape.
- **Expected count**: ~50 regions.

### 6. OpenStreetMap — Overpass API (supplementary)

- **Endpoint**: `https://overpass-api.de/api/interpreter`
- **Query**:

```overpass
[out:json][timeout:90];
(
  node["telecom"="data_center"];
  way["telecom"="data_center"];
  relation["telecom"="data_center"];
);
out center tags;
```

- For `way` and `relation` results, use the `center` lat/lng provided by Overpass.
- **Field mapping**:

| OSM tag | Our field |
|---|---|
| `name` | `name` |
| `operator` | `operator` |
| `addr:street` + `addr:housenumber` | `location.address` |
| `addr:city` | `location.city` |
| `addr:country` | `location.country` |
| `addr:postcode` | `location.postal_code` |
| `lat` / `lng` (or `center.lat`/`.lon`) | `location.lat` / `lng` |
| `website` | `media.website` |
| `start_date` (year) | `specs.year_built` |
| _entire element_ | `sources[0].raw` |

- **Source URL**: `https://www.openstreetmap.org/{node|way|relation}/{id}`
- **Rate limit**: Overpass is heavily rate-limited. Run this **once per scrape**, cache the result locally.
- **Expected count**: ~2,000–3,000 (very patchy globally).

### 7. NOT in scope for v1

- **Data Center Map / Cloudscene scraping**: skip. Their ToS forbids it and they aggressively block scrapers. Revisit only with a licensing deal.

## How to scrape — engineering rules

1. **One script per source.** Each emits its own `.jsonl` file. Don't try to dedupe across sources here — that happens in the ingester downstream.
2. **Idempotent.** Re-running must produce identical output (modulo `fetched_at`). Sort records by `slug` before writing.
3. **Retries.** On 5xx or network failure, retry up to 3× with exponential backoff (1s, 2s, 4s).
4. **Caching.** Cache HTTP responses to `./cache/{source}/{key}.json` during a run so a crash mid-run doesn't re-hit the server.
5. **Respect `robots.txt`** for HTML scrapes. Use a clear User-Agent string: `DataCenterMapBot/0.1 (+https://example.com/contact)`.
6. **No JS execution needed** for any source in this list. Plain HTTP + HTML parser is enough.
7. **Validate before writing.** Every emitted record must:
   - Pass JSON Schema validation (write one matching the schemas above)
   - Have non-null `name`, `location.country`, `location.lat`, `location.lng`, `status`, and ≥1 entry in `sources`
   - Have `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`
   - Records that fail validation go to `./out/rejected.{source}.jsonl` with a `_reason` field, NOT to the main output.

## Deliverables

1. The JSONL files listed in the **Output** section.
2. `report.md` with:
   - Records produced per source
   - Records rejected per source (with reason counts)
   - Total unique countries covered
   - Sample of 5 random records per source
   - Any sources that failed entirely
3. Source code in `./scrapers/` — one file per source — runnable independently:
   ```
   pnpm scrape:peeringdb
   pnpm scrape:aws
   pnpm scrape:gcp
   pnpm scrape:azure
   pnpm scrape:oracle
   pnpm scrape:osm
   pnpm scrape:all
   ```
4. `package.json` with all dependencies pinned.

## Tech stack (suggested)

- **Node 22 + TypeScript** OR **Python 3.12** — your choice
- HTTP: `undici`/`fetch` (Node) or `httpx` (Python)
- HTML: `cheerio` (Node) or `selectolax`/`BeautifulSoup` (Python)
- Validation: `zod` (Node) or `pydantic` (Python)
- Country code mapping: `i18n-iso-countries` (Node) or `pycountry` (Python)

## Out of scope (do NOT do)

- Database writes
- Deduplication across sources
- Geocoding addresses to coordinates (use metro centroids for cloud regions; skip facilities with missing coords)
- Photos / image downloads
- Building footprint polygons
- User accounts / authentication
