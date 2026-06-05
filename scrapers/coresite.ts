import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

// CoreSite groups all facilities in a metro onto a single city page; there is
// no per-facility URL. Index discovers the 12 metros, then each metro page is
// parsed for its h3-headed facility blocks ("CORESITE LA1 - LOS ANGELES DATA CENTER").
const INDEX_URL = "https://www.coresite.com/data-centers/locations";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const METRO_URL_RE = /^https:\/\/www\.coresite\.com\/data-center-locations\/([a-z-]+)\/?$/;

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "coresite",
    cacheKey: cacheKeyFor(url),
    headers: BROWSER_HEADERS,
  });
  return { body: res.body, fromCache: res.fromCache };
}

async function politeFetch(url: string): Promise<string> {
  const { body, fromCache } = await fetchHtml(url);
  if (!fromCache) await sleep(DELAY_MS);
  return body;
}

async function fetchMetroUrls(): Promise<string[]> {
  const html = await politeFetch(INDEX_URL);
  const $ = load(html);
  const out = new Set<string>();
  $("a[href]").each((_, a) => {
    const h = $(a).attr("href");
    if (!h) return;
    const abs = new URL(h, INDEX_URL).toString();
    if (METRO_URL_RE.test(abs)) out.add(abs);
  });
  return [...out].sort();
}

const KNOWN_CERTS = [
  "SOC 1", "SOC 2", "SOC 3",
  "ISO 9001", "ISO 14001", "ISO 22301", "ISO 27001", "ISO 27017", "ISO 27018", "ISO 50001",
  "PCI DSS", "PCI-DSS", "HIPAA", "NIST", "FedRAMP", "FISMA", "HITRUST",
  "LEED", "Energy Star",
];

function extractCerts(text: string): string[] {
  const found = new Set<string>();
  for (const c of KNOWN_CERTS) {
    if (new RegExp(`\\b${c.replace(/[-./]/g, ".")}\\b`, "i").test(text)) found.add(c);
  }
  return [...found].sort();
}

interface CoreSiteFacility {
  code: string;
  blockText: string;
  blockHtml: string;
}

// Each metro page renders facility blocks like:
//   <h3>CORESITE LA1 - LOS ANGELES DATA CENTER</h3>
//   ...spec paragraphs...
//   <h3>CORESITE LA2 - LOS ANGELES DATA CENTER</h3>
// We collect each h3 + everything until the next h3 of the same shape.
function extractFacilityBlocks($: ReturnType<typeof load>): CoreSiteFacility[] {
  const headings = $("h3").filter((_, h) => /CORESITE\s+[A-Z]{2,4}\d{1,2}\b/i.test($(h).text())).toArray();
  const out: CoreSiteFacility[] = [];
  for (let i = 0; i < headings.length; i++) {
    const $h = $(headings[i]!);
    const m = $h.text().match(/CORESITE\s+([A-Z]{2,4}\d{1,2})/i);
    if (!m || !m[1]) continue;
    const code = m[1].toUpperCase();
    // Walk siblings until the next matching h3.
    const collected: string[] = [];
    const collectedHtml: string[] = [];
    let cur: ReturnType<typeof $> = $h.next();
    while (cur.length) {
      if (cur.is("h3") && /CORESITE\s+[A-Z]{2,4}\d{1,2}\b/i.test(cur.text())) break;
      collected.push(cur.text());
      const h = $.html(cur);
      if (h) collectedHtml.push(h);
      cur = cur.next();
    }
    out.push({
      code,
      blockText: collected.join(" ").replace(/\s+/g, " ").trim(),
      blockHtml: collectedHtml.join("\n").slice(0, 8000),
    });
  }
  return out;
}

interface ParsedAddress {
  address: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
}

function parseAddress(text: string): ParsedAddress | null {
  // CoreSite uses ALL CAPS addresses with abbreviated suffixes:
  // "624 S. GRAND AVE., LOS ANGELES, CA 90017"
  const us = text.match(/(\d{1,6}\s+[\w'.\- ]+?(?:Drive|Dr|Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Way|Court|Ct|Place|Lane|Ln|Parkway|Pkwy|Loop|Square|Circle|Cir|Plaza|Terrace|Ter)\.?),?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}),\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i);
  if (us && us[1] && us[2] && us[3] && us[4]) {
    return {
      address: toTitleCase(us[1].trim()),
      city: toTitleCase(us[2].trim()),
      region: us[3].trim().toUpperCase(),
      postal: us[4].trim(),
    };
  }
  return null;
}

interface CoreSiteSpecs {
  power_mw: number | null;
  space_sqft: number | null;
  max_cabinet_density_kw: number | null;
  tier: "I" | "II" | "III" | "IV" | null;
}

function parseSpecs(block: string): CoreSiteSpecs {
  // CoreSite typically renders specs as "171,000+ SQUARE FEET" (the trailing
  // `+` breaks a naive `[\d,]+ square feet` regex). We allow the optional `+`
  // between the number and the unit.
  const sqftM = block.match(/([\d,]+)\s*\+?\s*(?:sq\.?\s*ft|sf|square\s*feet)/i);
  const mwM = block.match(/([\d.]+)\s*\+?\s*MW(?:\s+of\s+critical(?:\s+IT)?(?:\s+load)?)?/i);
  const densityM = block.match(/(?:Cabinet\s+density|Up to|Density)\s+(?:up\s+to\s+)?([\d.]+)\s*kW/i);
  const tierM = block.match(/Tier\s*(I{1,3}|IV)\b/i);
  const tierRaw = tierM?.[1]?.toUpperCase() ?? null;
  return {
    power_mw: mwM && mwM[1] ? Number(mwM[1]) : null,
    space_sqft: sqftM && sqftM[1] ? Number(sqftM[1].replace(/,/g, "")) : null,
    max_cabinet_density_kw: densityM && densityM[1] ? Number(densityM[1]) : null,
    tier: tierRaw && /^(I{1,3}|IV)$/.test(tierRaw) ? (tierRaw as "I" | "II" | "III" | "IV") : null,
  };
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMetroFacilities(metroUrl: string, html: string): unknown[] {
  const $ = load(html);
  const metroSlugM = metroUrl.match(METRO_URL_RE);
  const metroSlug = metroSlugM?.[1] ?? "unknown";
  const metroName = toTitleCase(metroSlug.replace(/-/g, " "));
  const blocks = extractFacilityBlocks($);
  const out: unknown[] = [];
  for (const block of blocks) {
    const addr = parseAddress(block.blockText);
    const specs = parseSpecs(block.blockText);
    const certs = extractCerts(block.blockText);
    out.push({
      slug: slugify("coresite", block.code, addr?.city ?? metroName),
      name: `CoreSite ${block.code}`,
      operator: "CoreSite",
      campus: null,
      code: block.code,
      location: {
        address: addr?.address ?? null,
        city: addr?.city ?? metroName,
        region: addr?.region ?? null,
        country: "US",
        postal_code: addr?.postal ?? null,
        lat: null,
        lng: null,
      },
      status: "operational",
      specs: {
        power_mw: specs.power_mw,
        power_redundancy: null,
        space_sqft: specs.space_sqft,
        space_sqm: null,
        raised_floor_sqft: null,
        min_cabinet_density_kw: null,
        max_cabinet_density_kw: specs.max_cabinet_density_kw,
        tier: specs.tier,
        year_built: null,
        year_opened: null,
        cooling: null,
        cooling_redundancy: null,
        pue: null,
        uptime_sla: null,
        generator_redundancy: null,
        generator_autonomy: null,
        ups_redundancy: null,
        power_distribution: null,
        building_description: null,
      },
      connectivity: { carriers_count: null, ixps_count: null, meet_me_rooms: null, cross_connects_count: null },
      certifications: certs.length ? certs : null,
      security: null,
      media: { photos: null, website: metroUrl, datasheet_url: null },
      sources: [
        {
          source: "coresite-com",
          source_id: block.code.toLowerCase(),
          source_url: metroUrl,
          fetched_at: nowIso(),
          raw: { metro_url: metroUrl, metro_slug: metroSlug, code: block.code, block_text: block.blockText.slice(0, 4000), specs, address: addr },
        },
      ],
    });
  }
  return out;
}

export async function scrapeCoreSite(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[coresite] starting — fetching metro index\n`);
  const metroUrls = await fetchMetroUrls();
  process.stderr.write(`[coresite] index → ${metroUrls.length} metros\n`);

  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  for (const url of metroUrls) {
    try {
      const html = await politeFetch(url);
      const facilities = parseMetroFacilities(url, html);
      accepted.push(...facilities);
      process.stderr.write(`[coresite] ${url.split("/").pop()} → ${facilities.length} facilities\n`);
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }
  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.coresite.jsonl", accepted);
  await writeRejected("coresite", rejected);
  process.stderr.write(`[coresite] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeCoreSite().catch((err) => {
    console.error("[coresite] fatal:", err);
    process.exit(1);
  });
}
