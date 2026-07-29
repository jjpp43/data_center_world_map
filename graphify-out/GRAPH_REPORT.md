# Graph Report - .  (2026-07-22)

## Corpus Check
- 135 files · ~90,521 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 595 nodes · 847 edges · 50 communities detected
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 244 edges (avg confidence: 0.54)
- Token cost: 43,000 input · 15,000 output

## God Nodes (most connected - your core abstractions)
1. `parseFacility()` - 15 edges
2. `Scraping agent brief (locations & cloud regions)` - 15 edges
3. `Scraping brief — operator pages (third pillar: specs)` - 10 edges
4. `main()` - 9 edges
5. `parseFacility()` - 9 edges
6. `CLAUDE.md — project context` - 9 edges
7. `MCP launch drafts (HN, X, registries)` - 9 edges
8. `parseFacility()` - 8 edges
9. `Scraping brief extension — peering relationships` - 8 edges
10. `proxy()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `3-tier strict matcher (exact → operator+name prefix → operator+code regex)` --semantically_similar_to--> `Three-stage dedup matcher`  [INFERRED] [semantically similar]
  CLAUDE.md → README.md
- `Operator slug formula slugify(operator-code-city)` --semantically_similar_to--> `Deterministic slug formula slugify(operator-name-city)`  [INFERRED] [semantically similar]
  scrapers/scrape-agent-operator-pages.md → scrape-agent.md
- `Peering ecosystem density concept (ASNs + IXPs per building)` --semantically_similar_to--> `Density tiers: ultra-dense (50+), dense (10–49), standard (1–9)`  [INFERRED] [semantically similar]
  scrape-agent-peering-relationships.md → public/llms.txt
- `Stranded-slug 308 redirects (data/facility-slug-redirects.json)` --semantically_similar_to--> `Canonical operator slugs + brand-name 308 redirects`  [INFERRED] [semantically similar]
  CLAUDE.md → public/llms.txt
- `Extraction strategy: JSON-LD → CSS selectors → regex last resort` --semantically_similar_to--> `Structured data set (WebSite/Organization/Dataset/Place/FAQPage/BreadcrumbList/CollectionPage)`  [INFERRED] [semantically similar]
  scrapers/scrape-agent-operator-pages.md → CLAUDE.md

## Hyperedges (group relationships)
- **Three-pillar ingest flow: locations, specs, interconnect → canonical rows** — scrapeagent_brief, opscrape_brief, peerrel_brief, readme_ingest_script, readme_match_data_center_fn, readme_canonical_source_split [EXTRACTED 0.95]
- **MCP launch pipeline: quota fix → landing page → posts → registries** — roadmap_phase1_mcp, claudemd_migration_0018, roadmap_launch_page, launchmcp_hn_post, launchmcp_x_thread, roadmap_registry_submissions, launchmcp_order_of_operations [EXTRACTED 0.90]
- **Answer-engine optimization surface: llms.txt + JSON-LD + listings + gated dataset** — llmstxt_file, readme_jsonld_place_faq, claudemd_structured_data, llmstxt_listings, llmstxt_public_dataset, claudemd_seo_titles [INFERRED 0.85]

## Communities

### Community 0 - "Data Model & SEO Taxonomy"
Cohesion: 0.03
Nodes (73): Data model (data_centers canonical + joins + api tables), Ingest order + idempotency keys, Mapbox v3.8+ gotchas (setProjection, style.load re-add, clusterProperties, zoom expressions), Rationale: spatial dedup branch matches across operators — wrong for canonicalization, Rationale: volatile city token in slugs stranded indexed URLs as 404s, Stranded-slug 308 redirects (data/facility-slug-redirects.json), 3-tier strict matcher (exact → operator+name prefix → operator+code regex), Citation guidance for AI assistants (+65 more)

### Community 1 - "App UI & API Key Components"
Cohesion: 0.03
Nodes (9): anniversaryOnOrBefore(), buildSummary(), computeCycle(), generateMetadata(), nextAnniversaryAfter(), resolveCountry(), csv(), parseProvider() (+1 more)

### Community 2 - "Caching, Conventions & MCP Platform"
Cohesion: 0.04
Nodes (62): lib/api-data.ts shared unstable_cache loaders, Rationale: /api/v1/* Cache-Control private — public leaked per-user rate-limit headers, Caching / egress: three layers (static geojson, ISR, matviews + unstable_cache), Coding conventions (no comments unless WHY, server components default, no co-author lines), Editorial design system (components/editorial.tsx primitives + color semantics), Rationale: Supabase egress is the dominant cost, so runtime never touches Supabase for map data, Env vars (Mapbox, Supabase, Polar, cron, PostHog), lib/indexable.ts — head vs long-tail indexability caps (+54 more)

### Community 3 - "Country & Density Data Loaders"
Cohesion: 0.06
Nodes (15): countryName(), countrySlug(), classifyDensity(), loadDensityIndex(), getIxpSet(), getNetworkSet(), getOperatorSet(), isIndexableIxp() (+7 more)

### Community 4 - "Ingest & Backfill Scripts"
Cohesion: 0.09
Nodes (20): certs(), firstAcross(), firstVal(), isEmpty(), main(), securityFeatures(), sumVals(), forwardGeocode() (+12 more)

### Community 5 - "API Response & Billing Helpers"
Cohesion: 0.1
Nodes (11): csvResponse(), errorResponse(), internalError(), toCsv(), hmacSha256Base64(), verifyWebhook(), applyEvent(), GET() (+3 more)

### Community 6 - "Equinix Scraper"
Cohesion: 0.18
Nodes (22): buildName(), buildSlug(), cacheKeyFor(), deriveCountry(), extractCertifications(), extractCityUrlsFromRegionIndex(), extractFacilityUrlsFromCityPage(), extractSpecCards() (+14 more)

### Community 7 - "Digital Realty Scraper"
Cohesion: 0.24
Nodes (15): asNumber(), asString(), cacheKeyFor(), collectAllValues(), extractCertsFromText(), fetchFacilityUrls(), fetchHtml(), findInTemplateBlocks() (+7 more)

### Community 8 - "Google Scraper & App Shell"
Cohesion: 0.13
Nodes (2): parseLocationLine(), scrapeGoogle()

### Community 9 - "Master Ingest Pipeline"
Cohesion: 0.26
Nodes (12): buildLookupMap(), buildPeeringdbFacIdMap(), ingestCloudRegions(), ingestFacilities(), ingestOperatorPages(), ingestOsm(), ingestPeeringdbIxes(), ingestPeeringdbIxfac() (+4 more)

### Community 10 - "CyrusOne Scraper"
Cohesion: 0.29
Nodes (13): cacheKeyFor(), extractCerts(), extractCode(), extractCountryFromTitle(), fetchFacilityUrls(), fetchHtml(), parseAddress(), parseFacility() (+5 more)

### Community 11 - "Cologix Scraper"
Cohesion: 0.31
Nodes (12): cacheKeyFor(), extractCerts(), fetchFacilityUrls(), fetchHtml(), inferCountryFromRegion(), parseCologixAddress(), parseFacility(), parseHeroSpecs() (+4 more)

### Community 12 - "CoreSite Scraper"
Cohesion: 0.32
Nodes (12): cacheKeyFor(), extractCerts(), extractFacilityBlocks(), fetchHtml(), fetchMetroUrls(), parseAddress(), parseMetroFacilities(), parseSpecs() (+4 more)

### Community 13 - "DataBank Scraper"
Cohesion: 0.33
Nodes (11): cacheKeyFor(), extractCerts(), fetchHtml(), fetchUrls(), findFacilityCode(), parseFacility(), parseSpecs(), politeFetch() (+3 more)

### Community 14 - "QTS Scraper"
Cohesion: 0.33
Nodes (11): cacheKeyFor(), extractCerts(), fetchFacilityUrls(), fetchHtml(), parseFacility(), parseQtsAddress(), parseQtsSpecs(), politeFetch() (+3 more)

### Community 15 - "MCP Rate-Limit Proxy"
Cohesion: 0.33
Nodes (9): applyRateHeaders(), classifyMcpRequest(), isKnownInvalid(), isNoChargeMcpMethod(), jsonError(), methodOf(), proxy(), rememberInvalid() (+1 more)

### Community 16 - "PeeringDB Facility Scraper"
Cohesion: 0.44
Nodes (8): buildSlug(), fetchPage(), joinAddress(), mapFacility(), mapStatus(), scrapePeeringDb(), sleep(), toNum()

### Community 17 - "Static Icons & Branding"
Cohesion: 0.31
Nodes (9): Document/File Icon, Globe Icon, Globe Projection View, Map Layers Metaphor, Stacked Layers App Icon (favicon), create-next-app Default Asset Set, Next.js Wordmark Logo, Vercel Triangle Logo (+1 more)

### Community 18 - "Mapbox Map Component"
Cohesion: 0.43
Nodes (6): attachLayers(), escapeHtml(), Map(), renderCloudPopup(), toCloudRegionGeoJSON(), toFacilityGeoJSON()

### Community 19 - "Stranded Slug Reconciliation"
Cohesion: 0.46
Nodes (7): arg(), bestLiveTwin(), client(), extractStrandedSlugs(), loadLiveSlugs(), main(), sharedSegments()

### Community 20 - "Iron Mountain Scraper"
Cohesion: 0.32
Nodes (4): buildRecord(), scrapeIronMountain(), urlSlug(), withBrowser()

### Community 21 - "Data Quality Audit"
Cohesion: 0.6
Nodes (5): haversineMeters(), loadAll(), main(), normalizeOperator(), pct()

### Community 22 - "Scraper Reporting"
Cohesion: 0.6
Nodes (5): buildReport(), pickCountries(), readJsonl(), sampleN(), summarizeRejected()

### Community 23 - "PeeringDB Aggregate Report"
Cohesion: 0.6
Nodes (5): appendReport(), buildFacIdIndex(), main(), readJsonl(), topNByCount()

### Community 24 - "PeeringDB Relations Common"
Cohesion: 0.4
Nodes (2): paginate(), sleep()

### Community 25 - "OpenStreetMap Scraper"
Cohesion: 0.6
Nodes (5): joinAddress(), mapElement(), parseYear(), pickCoord(), scrapeOsm()

### Community 26 - "JSONL Writer & Validation"
Cohesion: 0.33
Nodes (0): 

### Community 27 - "Cached HTTP Fetch Layer"
Cohesion: 0.6
Nodes (5): cachedFetch(), cacheFilePath(), readCache(), sleep(), writeCache()

### Community 28 - "GeoJSON Build Step"
Cohesion: 0.8
Nodes (4): buildCloudRegions(), buildFacilities(), client(), main()

### Community 29 - "Operator Coverage Report"
Cohesion: 0.7
Nodes (4): appendReport(), completenessRow(), main(), readJsonl()

### Community 30 - "GCP Region Scraper"
Cohesion: 1.0
Nodes (2): fetchEnrichment(), scrapeGcp()

### Community 31 - "Oracle Region Scraper"
Cohesion: 1.0
Nodes (2): scrapeOracle(), touchSourcePage()

### Community 32 - "AWS Region Scraper"
Cohesion: 1.0
Nodes (2): fetchEnrichment(), scrapeAws()

### Community 33 - "PeeringDB Network Scraper"
Cohesion: 1.0
Nodes (2): blank(), scrapePeeringDbNet()

### Community 34 - "Azure Region Scraper"
Cohesion: 1.0
Nodes (2): scrapeAzure(), touchSourcePages()

### Community 35 - "PeeringDB IX Scraper"
Cohesion: 1.0
Nodes (2): blank(), scrapePeeringDbIx()

### Community 36 - "Scraper Schema Helpers"
Cohesion: 0.67
Nodes (0): 

### Community 37 - "Cloud Region Emitter"
Cohesion: 0.67
Nodes (0): 

### Community 38 - "Scraper Engineering Rules"
Cohesion: 0.67
Nodes (3): DataCenterMapBot/0.1 User-Agent convention, Engineering rules (one script per source, idempotent, retries, caching, robots.txt), Validation + rejected.{source}.jsonl with _reason

### Community 39 - "Robots.txt Route"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Orphan Record Audit"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Meta Scraper"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "PeeringDB NetFac Scraper"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Scraper Orchestrator"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "PeeringDB IXFac Scraper"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Slugify Utility"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Theme Bootstrap & Hydration"
Cohesion: 1.0
Nodes (2): Hydration invariant: suppressHydrationWarning + next/link nav, Inline pre-paint theme bootstrap script + dcw-theme cookie

### Community 47 - "SEO Title & A11y Rationale"
Cohesion: 1.0
Nodes (2): CTR-tuned per-slug titles (numeric lead, dual spelling), Rationale: Mapbox canvas has no crawlable text, so homepage needs sr-only H1

### Community 48 - "Next Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Next.js Config"
Cohesion: 1.0
Nodes (0): 

## Ambiguous Edges - Review These
- `Stacked Layers App Icon (favicon)` → `Next.js Wordmark Logo`  [AMBIGUOUS]
  app/icon.png · relation: conceptually_related_to

## Knowledge Gaps
- **49 isolated node(s):** `Rationale: public directories disagree by 3x, so pick a deliberate scope`, `Rationale: CyrusOne 0% is a naming-convention mismatch, QTS is campus-grain`, `Rationale: stable canonical IDs so downstream FKs never break on re-scrape`, `Schema: data_centers, source_records, networks, ixes, cloud_regions`, `Rationale: FAQPage/TL;DR shape is exactly what AI answer engines extract verbatim` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Robots.txt Route`** (2 nodes): `robots.ts`, `robots()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Orphan Record Audit`** (2 nodes): `audit-orphans.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Meta Scraper`** (2 nodes): `meta.ts`, `scrapeMeta()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PeeringDB NetFac Scraper`** (2 nodes): `peeringdb-netfac.ts`, `scrapePeeringDbNetfac()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scraper Orchestrator`** (2 nodes): `all.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PeeringDB IXFac Scraper`** (2 nodes): `peeringdb-ixfac.ts`, `scrapePeeringDbIxfac()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Slugify Utility`** (2 nodes): `slug.ts`, `slugify()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme Bootstrap & Hydration`** (2 nodes): `Hydration invariant: suppressHydrationWarning + next/link nav`, `Inline pre-paint theme bootstrap script + dcw-theme cookie`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SEO Title & A11y Rationale`** (2 nodes): `CTR-tuned per-slug titles (numeric lead, dual spelling)`, `Rationale: Mapbox canvas has no crawlable text, so homepage needs sr-only H1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next Env Types`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Config`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Stacked Layers App Icon (favicon)` and `Next.js Wordmark Logo`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Scraping agent brief (locations & cloud regions)` connect `Data Model & SEO Taxonomy` to `Caching, Conventions & MCP Platform`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `CLAUDE.md — project context` connect `Caching, Conventions & MCP Platform` to `Data Model & SEO Taxonomy`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `parseFacility()` (e.g. with `extractSpecCards()` and `parseAddress()`) actually correct?**
  _`parseFacility()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `main()` (e.g. with `ingestCloudRegions()` and `ingestFacilities()`) actually correct?**
  _`main()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `parseFacility()` (e.g. with `asString()` and `asNumber()`) actually correct?**
  _`parseFacility()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Rationale: public directories disagree by 3x, so pick a deliberate scope`, `Rationale: CyrusOne 0% is a naming-convention mismatch, QTS is campus-grain`, `Rationale: stable canonical IDs so downstream FKs never break on re-scrape` to the rest of the system?**
  _49 weakly-connected nodes found - possible documentation gaps or missing edges._