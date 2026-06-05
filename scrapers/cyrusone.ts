import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const SITEMAP = "https://www.cyrusone.com/sitemap.xml";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE = /^https:\/\/www\.cyrusone\.com\/data-centers\/([a-z-]+)\/([a-z0-9-]+)$/;

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "cyrusone",
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

async function fetchFacilityUrls(): Promise<string[]> {
  const xml = await politeFetch(SITEMAP);
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u): u is string => typeof u === "string");
  // Drop editorial pages like "aurora-il-back-up-generator-schedule" that
  // happen to live under /data-centers/.
  const facilities = all.filter((u) => {
    if (!FACILITY_URL_RE.test(u)) return false;
    return !/-(?:back-?up|generator|schedule|policy|notice|update|news|press)/.test(u);
  });
  return [...new Set(facilities)].sort();
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

interface ParsedAddress {
  address: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  country: string | null;
}

function parseAddress(text: string): ParsedAddress | null {
  // US: "1649 W Frankford Rd, Carrollton, TX 75007"
  const us = text.match(/(\d{1,6}\s+[\w'.\-/]+(?:\s+[\w'.\-/]+){1,5}),\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}),\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (us && us[1] && us[2] && us[3] && us[4]) {
    return { address: us[1].trim(), city: us[2].trim(), region: us[3].trim(), postal: us[4].trim(), country: "US" };
  }
  // Generic international with trailing country: "Linieweg 1,1165 AA, Halfweg, Netherlands"
  // or "225C Bath Road, Slough SL1 5PP, United Kingdom"
  const intl = text.match(/(\d{1,6}\s+[\w'.\- ]+?),\s*([\w'.\- ]+?),\s+([A-Za-zÀ-ÿ' .-]+?)\s*(?:Download|$|\.[a-z])/);
  if (intl && intl[1] && intl[2] && intl[3]) {
    const countryName = intl[3].trim();
    const code = toCountryCode(countryName);
    if (code) {
      return { address: intl[1].trim(), city: intl[2].trim(), region: null, postal: null, country: code };
    }
  }
  return null;
}

interface CyrusOneSpecs {
  power_mw: number | null;
  space_sqft: number | null;
}

function parseSpecs(window: string): CyrusOneSpecs {
  // CyrusOne phrases vary: "37,000 square feet", "delivers 30 MW", "10 MW of
  // critical power", "180 MW IT load". Anchor on numeric + unit and pick the
  // most specific match available.
  const sqftM =
    window.match(/([\d,]+)\s*(?:net\s+|gross\s+|total\s+|raised\s+floor\s+)?(?:square\s*feet|sq\.?\s*ft|sf)\b/i);
  const mwCrit = window.match(/([\d.]+)\s*MW\s+(?:of\s+)?(?:critical\s+power|IT\s+load|critical\s+IT)/i);
  const mwAny = window.match(/(?:delivers?|offers?|provides?|capacity\s+of|total)\s*[^\d]{0,10}([\d.]+)\s*MW\b/i);
  const mwFallback = window.match(/([\d.]+)\s*MW\b/i);
  const mwMatch = mwCrit ?? mwAny ?? mwFallback;

  return {
    power_mw: mwMatch && mwMatch[1] ? Number(mwMatch[1]) : null,
    space_sqft: sqftM && sqftM[1] ? Number(sqftM[1].replace(/,/g, "")) : null,
  };
}

function extractCode(title: string, urlSlug: string): string {
  // Title patterns:
  //   "London, UK: LON5 | CyrusOne"     — single code
  //   "Allen, TX: DFW3-DFW5 | CyrusOne" — code range (pick first)
  //   "Wappingers Falls, NY: NYM7 | CyrusOne"
  const titleSingle = title.match(/:\s*([A-Z]{2,4}\d{1,2})(?:-[A-Z]{2,4}\d{1,2})?\s*(?:\||$)/);
  if (titleSingle && titleSingle[1]) return titleSingle[1];
  // URL-suffix codes: "frankfurt-germany-fra7" → FRA7
  const urlM = urlSlug.match(/-([a-z]{2,4}\d{1,2})$/i);
  if (urlM && urlM[1]) return urlM[1].toUpperCase();
  return urlSlug.toUpperCase();
}

// Title pattern "<City>, <Country/State>: <code> | CyrusOne" — extract the
// middle token. For US records this gives a state abbr (e.g. "TX"); for
// international it gives a country name ("Netherlands", "UK", "Germany").
function extractCountryFromTitle(title: string): string | null {
  const m = title.match(/^\s*[^,]+,\s+([^:]+?)\s*:/);
  if (!m || !m[1]) return null;
  const raw = m[1].trim();
  // US state abbreviation pattern — let address parsing handle the rest.
  if (/^[A-Z]{2}$/.test(raw)) return "US";
  return toCountryCode(raw);
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFacility(url: string, html: string): { record: unknown } | { _reject: string } {
  const $ = load(html);
  const m = url.match(FACILITY_URL_RE);
  if (!m || !m[1] || !m[2]) return { _reject: `url does not match: ${url}` };
  const region = m[1];
  const urlSlug = m[2];

  const title = $("title").text().trim().replace(/\s+/g, " ");
  const h1 = $("h1").first().text().trim().replace(/\s+/g, " ");

  const code = extractCode(title, urlSlug);
  // Scope spec extraction to a window starting at the page title's mention
  // of this facility, to avoid corporate footer / nav contamination.
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const anchorIdx = bodyText.indexOf(code);
  const window = anchorIdx >= 0 ? bodyText.slice(anchorIdx, anchorIdx + 4000) : bodyText.slice(0, 4000);

  const addr = parseAddress(window) ?? parseAddress(bodyText);
  const specs = parseSpecs(window);
  const certs = extractCerts(window);

  // Country priority: parsed address > title middle-token > URL region fallback
  // (only "north-america" → US; emea/apac without an address are unknown).
  const titleCountry = extractCountryFromTitle(title);
  const regionFallback = region === "north-america" ? "US" : null;
  const country = toCountryCode(addr?.country ?? null) ?? titleCountry ?? regionFallback;

  const city = addr?.city ?? toTitleCase(urlSlug.replace(/-([a-z]{2,4}\d{1,2})$/i, "").replace(/-(uk|usa|netherlands|germany|france|italy|spain|ireland|texas|tx|illinois|il|ohio|ny|nc|ct|ia|ky|wa|tn|az)$/i, "").replace(/-/g, " "));

  return {
    record: {
      slug: slugify("cyrusone", code, city),
      name: h1 ? `CyrusOne ${code}` : `CyrusOne ${code}`,
      operator: "CyrusOne",
      campus: null,
      code,
      location: {
        address: addr?.address ?? null,
        city,
        region: addr?.region ?? null,
        country: country ?? "US",
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
        max_cabinet_density_kw: null,
        tier: null,
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
      media: { photos: null, website: url, datasheet_url: null },
      sources: [
        {
          source: "cyrusone-com",
          source_id: urlSlug,
          source_url: url,
          fetched_at: nowIso(),
          raw: { url, title, h1, region, url_slug: urlSlug, specs, address: addr, code },
        },
      ],
    },
  };
}

export async function scrapeCyrusOne(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[cyrusone] starting — fetching sitemap\n`);
  const urls = await fetchFacilityUrls();
  process.stderr.write(`[cyrusone] sitemap → ${urls.length} facility URLs\n`);

  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  let n = 0;
  for (const url of urls) {
    n++;
    try {
      const html = await politeFetch(url);
      const parsed = parseFacility(url, html);
      if ("_reject" in parsed) rejected.push({ record: { url }, reason: parsed._reject });
      else accepted.push(parsed.record);
      if (n % 10 === 0 || n === urls.length) process.stderr.write(`[cyrusone] parsed ${n}/${urls.length}\n`);
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }
  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.cyrusone.jsonl", accepted);
  await writeRejected("cyrusone", rejected);
  process.stderr.write(`[cyrusone] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeCyrusOne().catch((err) => {
    console.error("[cyrusone] fatal:", err);
    process.exit(1);
  });
}
