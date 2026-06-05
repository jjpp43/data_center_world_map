import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const SITEMAP = "https://www.databank.com/db_data_center-sitemap.xml";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE = /^https:\/\/www\.databank\.com\/data-centers\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?\/?$/;

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "databank",
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

async function fetchUrls(): Promise<string[]> {
  const xml = await politeFetch(SITEMAP);
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u): u is string => typeof u === "string");
  const matched = [...new Set(all.filter((u) => FACILITY_URL_RE.test(u)))];
  // Drop URLs that are parents of other URLs in the sitemap — those are metro
  // or campus overview pages, not individual facilities. /cleveland/ stays
  // because it has no child URLs; /atlanta/ is dropped because /atlanta/.../ children exist.
  const set = new Set(matched);
  const leaves = matched.filter((u) => {
    const prefix = u.endsWith("/") ? u : u + "/";
    for (const other of set) {
      if (other === u) continue;
      if (other.startsWith(prefix) && other.length > prefix.length) return false;
    }
    return true;
  });
  return leaves.sort();
}

const KNOWN_CERTS = [
  "SOC 1",
  "SOC 2",
  "SOC 3",
  "ISO 9001",
  "ISO 14001",
  "ISO 22301",
  "ISO 27001",
  "ISO 27017",
  "ISO 27018",
  "ISO 50001",
  "PCI DSS",
  "PCI-DSS",
  "HIPAA",
  "NIST",
  "FedRAMP",
  "FISMA",
  "HITRUST",
];

function extractCerts(text: string): string[] {
  const found = new Set<string>();
  for (const c of KNOWN_CERTS) {
    if (new RegExp(`\\b${c.replace(/[-./]/g, ".")}\\b`, "i").test(text)) found.add(c);
  }
  return [...found].sort();
}

// DataBank pages embed the facility code in a `(XXX\d+)` callout in the body.
// The h1 sometimes has just the metro code in parens ("Cleveland Data Center
// (CLE)") and the actual facility code ("(CLE1)") appears nearby. Prefer the
// code that includes a digit suffix.
function findFacilityCode(bodyText: string, h1: string): string | null {
  const h1Idx = bodyText.indexOf(h1);
  const window = h1Idx >= 0 ? bodyText.slice(Math.max(0, h1Idx - 50), h1Idx + 1500) : bodyText.slice(0, 1500);
  const withDigit = window.match(/\(([A-Z]{2,4}\d{1,2})\)/);
  if (withDigit && withDigit[1]) return withDigit[1].toUpperCase();
  const bareMetro = window.match(/\(([A-Z]{2,4})\)/);
  if (bareMetro && bareMetro[1]) return bareMetro[1].toUpperCase();
  return null;
}

interface DatabankSpecs {
  power_mw: number | null;
  space_sqft: number | null;
  it_load_mw: number | null;
  building_sqft: number | null;
  acres: number | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
}

function parseSpecs(bodyText: string): DatabankSpecs {
  // Most pages put facility-specific specs near labeled phrases like
  // "200,000 IT Square Feet" or "69.9MW Critical IT Load". On campus pages
  // these repeat for each child facility — pick the first occurrence as the
  // page's own headline.
  // DataBank's only reliable per-facility callouts are `<N> IT Square Feet`
  // and `<N>MW Critical IT Load` — these labels appear next to the facility's
  // own spec block. Plain "square feet" / "MW" elsewhere on the page (e.g.
  // describing office space at the surrounding development) is misleading.
  const sqftM = bodyText.match(/([\d,]+)\s*IT\s*Square\s*F(?:ee|oo)?t/i);
  const powerM =
    bodyText.match(/([\d.]+)\s*MW\s+Critical(?:\s+IT)?\s+Load/i) ??
    bodyText.match(/([\d.]+)\s*MW\b/i);
  const acresM = bodyText.match(/([\d.]+)\s*Acres?/i);

  // Address: every facility page has "<name> (CODE) <street> - <city>, <state> <zip>"
  // as the canonical introduction. We anchor on the parenthesized facility code
  // because street suffixes vary too widely ("St NW", "Dr SW", "Street Southwest").
  const addrM = bodyText.match(
    /\(([A-Z]{2,4}\d{1,2})\)\s+([^-–]+?)\s+[-–]\s+([A-Z][A-Za-zÀ-ÿ' .-]+?),\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
  );
  let street: string | null = null;
  let city: string | null = null;
  let region: string | null = null;
  let postal: string | null = null;
  if (addrM && addrM[2] && addrM[3] && addrM[4] && addrM[5]) {
    street = addrM[2].trim();
    city = addrM[3].trim();
    region = addrM[4].trim();
    postal = addrM[5].trim();
  }

  return {
    power_mw: powerM ? Number(powerM[1]) : null,
    space_sqft: sqftM ? Number(sqftM[1]!.replace(/,/g, "")) : null,
    it_load_mw: powerM ? Number(powerM[1]) : null,
    building_sqft: null,
    acres: acresM ? Number(acresM[1]) : null,
    street_address: street,
    city,
    region,
    postal,
  };
}

interface ParsedDatabank {
  record: unknown;
}

function parseFacility(url: string, html: string): ParsedDatabank | { _reject: string } {
  const $ = load(html);
  const m = url.match(FACILITY_URL_RE);
  if (!m || !m[1]) return { _reject: `url does not match: ${url}` };

  const citySlug = m[1];
  const seg2 = m[2] ?? null;
  const seg3 = m[3] ?? null;
  void seg3;

  const h1Raw = $("h1").first().text().trim().replace(/\s+/g, " ");
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  const bodyCode = findFacilityCode(bodyText, h1Raw);
  // A real facility code is `[A-Z]{2,4}\d+` (BOS1, ATL5, DFW4). If we didn't
  // find one in the page body, the URL is an editorial / service page that
  // slipped through the sitemap filter — reject it.
  if (!bodyCode || !/^[A-Z]{2,4}\d+$/.test(bodyCode)) {
    return { _reject: `no facility code in body (got ${bodyCode ?? "null"})` };
  }
  const finalCode = bodyCode;

  const specs = parseSpecs(bodyText);
  const certs = extractCerts(bodyText);

  const country = "US"; // DataBank's footprint is US + a single London site; treat London specially.
  const isLondon = citySlug === "london";
  const finalCountry = isLondon ? "GB" : country;

  // City: prefer the parsed address city, then the URL slug.
  const city = specs.city ?? toTitleCase(citySlug.replace(/-/g, " "));

  return {
    record: {
      slug: slugify("databank", finalCode, city),
      name: `DataBank ${finalCode}`,
      operator: "DataBank",
      campus: seg2 && seg3 ? toTitleCase(seg2.replace(/-/g, " ")) : null,
      code: finalCode,
      location: {
        address: specs.street_address,
        city,
        region: specs.region,
        country: finalCountry,
        postal_code: specs.postal,
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
        site_acres: specs.acres,
      },
      connectivity: {
        carriers_count: null,
        ixps_count: null,
        meet_me_rooms: null,
        cross_connects_count: null,
      },
      certifications: certs.length ? certs : null,
      security: null,
      media: {
        photos: null,
        website: url,
        datasheet_url: null,
      },
      sources: [
        {
          source: "databank-com",
          source_id: finalCode.toLowerCase(),
          source_url: url,
          fetched_at: nowIso(),
          raw: {
            url,
            h1: h1Raw,
            url_segments: [citySlug, seg2, seg3].filter(Boolean),
            body_code: bodyCode,
            specs,
            certifications_text: certs,
          },
        },
      ],
    },
  };
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function scrapeDataBank(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[databank] starting — fetching sitemap\n`);
  const urls = await fetchUrls();
  process.stderr.write(`[databank] sitemap → ${urls.length} URLs\n`);

  const acceptedRaw: Array<{ slug: string; record: unknown }> = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  let n = 0;
  for (const url of urls) {
    n++;
    try {
      const html = await politeFetch(url);
      const parsed = parseFacility(url, html);
      if ("_reject" in parsed) {
        rejected.push({ record: { url }, reason: parsed._reject });
      } else {
        const rec = parsed.record as { slug: string };
        acceptedRaw.push({ slug: rec.slug, record: rec });
      }
      if (n % 20 === 0 || n === urls.length) {
        process.stderr.write(`[databank] parsed ${n}/${urls.length}\n`);
      }
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  // De-dup: city pages and campus pages often resolve to the same slug as
  // their child facility (e.g. /cleveland/ and /cleveland/1255-euclid-ave/
  // both produce "databank-cle-cleveland"). Prefer the deeper URL since it
  // has the canonical street address.
  const bySlug = new Map<string, { slug: string; record: unknown; depth: number }>();
  for (const item of acceptedRaw) {
    const r = item.record as { sources: Array<{ source_url: string }> };
    const depth = (r.sources?.[0]?.source_url.split("/").filter(Boolean).length ?? 0);
    const prior = bySlug.get(item.slug);
    if (!prior || depth > prior.depth) bySlug.set(item.slug, { ...item, depth });
  }
  const accepted = [...bySlug.values()].map((v) => v.record);
  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));

  await writeJsonl("facilities.databank.jsonl", accepted);
  await writeRejected("databank", rejected);

  process.stderr.write(`[databank] done — accepted=${accepted.length} (dedup'd from ${acceptedRaw.length}) rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeDataBank().catch((err) => {
    console.error("[databank] fatal:", err);
    process.exit(1);
  });
}
