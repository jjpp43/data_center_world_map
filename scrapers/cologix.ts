import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const SITEMAP = "https://cologix.com/data-centers-sitemap.xml";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE = /^https:\/\/cologix\.com\/data-centers\/([a-z0-9-]+)\/([a-z]{3}\d{1,2})\/?$/;

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "cologix",
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
  return [...new Set(all.filter((u) => FACILITY_URL_RE.test(u)))].sort();
}

interface ParsedAddress {
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

function parseCologixAddress(text: string): ParsedAddress {
  // "1250 Boulevard René-Lévesque West, Montréal, Québec"
  // "530 Rue Bériault Street, Longueuil, Québec"
  // "8534 Concord Center Drive, Englewood, Colorado"
  const t = text.trim();
  if (!t) return { address: null, city: null, region: null, country: null };
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { address: t, city: null, region: null, country: null };

  const country = inferCountryFromRegion(parts[parts.length - 1] ?? null);
  if (parts.length === 2) {
    return { address: null, city: parts[0] ?? null, region: parts[1] ?? null, country };
  }
  // 3+ parts: [street, city, region, (country)]
  return {
    address: parts[0] ?? null,
    city: parts[1] ?? null,
    region: parts[2] ?? null,
    country,
  };
}

const CA_PROVINCES = new Set(["Québec", "Quebec", "Ontario", "British Columbia", "Alberta", "Manitoba", "Saskatchewan", "Nova Scotia", "New Brunswick", "Newfoundland", "Prince Edward Island"]);
function inferCountryFromRegion(region: string | null): string | null {
  if (!region) return null;
  if (CA_PROVINCES.has(region)) return "CA";
  // US state names — let the iso library map them via city-level fallback;
  // Cologix is North America only, so US is the safe default for non-CA regions.
  const cc = toCountryCode(region);
  if (cc) return cc;
  return "US";
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

interface HeroSpecs {
  sqft: number | null;
  mw: number | null;
  tier: "I" | "II" | "III" | "IV" | null;
  carriers_count: number | null;
  has_mmr: boolean;
}

// Each Cologix facility page describes itself in a hero/intro section, e.g.
// "TOR4 is a 50K SQFT, purpose-built Scalelogix data center offering 11 MW of
// power ..." or "MTL10 offers 180K SQFT and 35 MW of critical power ...".
// We extract these values from the text window immediately after the page's
// h1, which is the only region guaranteed to describe THIS facility (the
// rest of the page is shared navigation/footer content listing every site).
function parseHeroSpecs(bodyText: string, h1: string): HeroSpecs {
  const start = bodyText.indexOf(h1);
  const window = start >= 0 ? bodyText.slice(start, start + 2500) : bodyText.slice(0, 2500);

  const sqftM = window.match(/([\d.,]+)\s*(K)?\s*(?:SQFT|sq\.?\s*ft|square feet)/i);
  let sqft: number | null = null;
  if (sqftM && sqftM[1]) {
    const raw = Number(sqftM[1].replace(/,/g, ""));
    sqft = Number.isFinite(raw) ? (sqftM[2] ? Math.round(raw * 1000) : Math.round(raw)) : null;
  }

  const mwM = window.match(/([\d.,]+)\s*MW\b/i);
  const mw = mwM && mwM[1] ? Number(mwM[1].replace(/,/g, "")) : null;

  const tierM = window.match(/Tier\s*(I{1,3}|IV)\b/i);
  const tierRaw = tierM?.[1]?.toUpperCase() ?? null;
  const tier = tierRaw && /^(I{1,3}|IV)$/.test(tierRaw)
    ? (tierRaw as "I" | "II" | "III" | "IV")
    : null;

  const carriersM = window.match(/(\d+)\+?\s*(?:unique\s+)?(?:carriers?|network (?:service )?providers?)/i);
  const carriers_count = carriersM && carriersM[1] ? Number(carriersM[1]) : null;

  const has_mmr = /Meet-Me-Room|MMR\b/i.test(window);

  return { sqft, mw, tier, carriers_count, has_mmr };
}

interface ParsedCologix {
  record: unknown;
}

function parseFacility(url: string, html: string): ParsedCologix | { _reject: string } {
  const $ = load(html);
  const m = url.match(FACILITY_URL_RE);
  if (!m || !m[1] || !m[2]) return { _reject: `url does not match facility pattern: ${url}` };
  const citySlug = m[1];
  const code = m[2];

  const h1 = $("h1").first().text().trim().replace(/\s+/g, " ");
  const addressText = $(".data-centers-address").first().text().trim().replace(/\s+/g, " ") || null;
  const metaDescription = $('meta[name="description"]').attr("content") ?? null;

  const parsedAddr = addressText ? parseCologixAddress(addressText) : { address: null, city: null, region: null, country: null };
  const country = parsedAddr.country ?? "US";

  const bodyText = $("body").text().replace(/\s+/g, " ");
  const hero = parseHeroSpecs(bodyText, h1);
  const certs = extractCerts(bodyText);

  return {
    record: {
      slug: slugify("cologix", code, parsedAddr.city ?? citySlug.replace(/-/g, " ")),
      name: `Cologix ${code.toUpperCase()}`,
      operator: "Cologix",
      campus: null,
      code: code.toUpperCase(),
      location: {
        address: parsedAddr.address,
        city: parsedAddr.city ?? toTitleCase(citySlug.replace(/-/g, " ")),
        region: parsedAddr.region,
        country,
        postal_code: null,
        lat: null,
        lng: null,
      },
      status: "operational",
      specs: {
        power_mw: hero.mw,
        power_redundancy: null,
        space_sqft: hero.sqft,
        space_sqm: null,
        raised_floor_sqft: null,
        min_cabinet_density_kw: null,
        max_cabinet_density_kw: null,
        tier: hero.tier,
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
      connectivity: {
        carriers_count: hero.carriers_count,
        ixps_count: null,
        meet_me_rooms: hero.has_mmr ? 1 : null,
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
          source: "cologix-com",
          source_id: code,
          source_url: url,
          fetched_at: nowIso(),
          raw: {
            url,
            h1,
            code,
            address_text: addressText,
            meta_description: metaDescription,
            hero_specs: hero,
          },
        },
      ],
    },
  };
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function scrapeCologix(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[cologix] starting — fetching sitemap\n`);
  const urls = await fetchFacilityUrls();
  process.stderr.write(`[cologix] sitemap → ${urls.length} facility URLs\n`);

  const accepted: unknown[] = [];
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
        accepted.push(parsed.record);
      }
      if (n % 10 === 0 || n === urls.length) {
        process.stderr.write(`[cologix] parsed ${n}/${urls.length}\n`);
      }
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.cologix.jsonl", accepted);
  await writeRejected("cologix", rejected);

  process.stderr.write(`[cologix] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeCologix().catch((err) => {
    console.error("[cologix] fatal:", err);
    process.exit(1);
  });
}
