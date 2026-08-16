import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const SITEMAP = "https://vantage-dc.com/data_center-sitemap.xml";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};
const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE =
  /^https:\/\/vantage-dc\.com\/data-center-locations\/(north-america|emea|apac)\/([a-z0-9-]+)\/?$/i;

const COUNTRY_FROM_TAIL: Record<string, string> = {
  virginia: "US",
  va: "US",
  california: "US",
  arizona: "US",
  washington: "US",
  ohio: "US",
  nevada: "US",
  wisconsin: "US",
  texas: "US",
  tx: "US",
  canada: "CA",
  malaysia: "MY",
  "hong-kong": "HK",
  japan: "JP",
  australia: "AU",
  taiwan: "TW",
  germany: "DE",
  ireland: "IE",
  italy: "IT",
  poland: "PL",
  "south-africa": "ZA",
  switzerland: "CH",
  "united-kingdom": "GB",
};

const US_REGION_FROM_TAIL: Record<string, string> = {
  virginia: "VA",
  va: "VA",
  california: "CA",
  arizona: "AZ",
  washington: "WA",
  ohio: "OH",
  nevada: "NV",
  wisconsin: "WI",
  texas: "TX",
  tx: "TX",
};
const KNOWN_CERTS = [
  "SOC 1", "SOC 2", "SOC 3",
  "ISO 9001", "ISO 14001", "ISO 22301", "ISO 27001",
  "PCI DSS", "LEED", "Energy Star",
];

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function politeFetch(url: string): Promise<string> {
  const res = await cachedFetch(url, {
    cacheNamespace: "vantage",
    cacheKey: cacheKeyFor(url),
    headers: BROWSER_HEADERS,
  });
  if (!res.fromCache) await sleep(DELAY_MS);
  return res.body;
}

async function fetchUrls(): Promise<string[]> {
  const xml = await politeFetch(SITEMAP);
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u): u is string => !!u);
  return [...new Set(all.filter((u) => !u.includes("/fr/") && FACILITY_URL_RE.test(u)))].sort();
}

function extractCerts(text: string): string[] {
  const found = new Set<string>();
  for (const c of KNOWN_CERTS) {
    if (new RegExp(`\\b${c.replace(/[-./]/g, ".")}\\b`, "i").test(text)) found.add(c);
  }
  return [...found].sort();
}

function parseCompactNumber(raw: string): number | null {
  const m = raw.trim().replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mul = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase()] ?? 1;
  return n * mul;
}

function countryFromSlug(slug: string, continent: string): string | null {
  const parts = slug.toLowerCase().split("-");
  for (let i = parts.length; i >= 1; i--) {
    const tail = parts.slice(-i).join("-");
    if (COUNTRY_FROM_TAIL[tail]) return COUNTRY_FROM_TAIL[tail];
  }
  if (continent === "north-america") return "US";
  return null;
}

function regionFromSlug(slug: string): string | null {
  const parts = slug.toLowerCase().split("-");
  for (let i = parts.length; i >= 1; i--) {
    const tail = parts.slice(-i).join("-");
    if (US_REGION_FROM_TAIL[tail]) return US_REGION_FROM_TAIL[tail];
  }
  return null;
}

function campusFromSlug(slug: string): string {
  const parts = slug.split("-");
  let cut = parts.length;
  for (let i = 1; i <= 3 && i <= parts.length; i++) {
    const tail = parts.slice(-i).join("-").toLowerCase();
    if (COUNTRY_FROM_TAIL[tail]) {
      cut = parts.length - i;
      break;
    }
  }
  return parts
    .slice(0, cut)
    .map((p) => {
      if (/^(i|ii|iii|iv|v)$/i.test(p)) return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

function parseFacility(url: string, html: string): { record: unknown } | { _reject: string } {
  const $ = load(html);
  const m = url.match(FACILITY_URL_RE);
  if (!m?.[1] || !m[2]) return { _reject: `url does not match: ${url}` };
  const continent = m[1].toLowerCase();
  const urlSlug = m[2].toLowerCase();

  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (/undisclosed/i.test(h1)) return { _reject: "undisclosed location" };

  let power_mw: number | null = null;
  let space_sqft: number | null = null;
  let site_acres: number | null = null;

  $(".overview-block").each((_, el) => {
    const digit = $(el).find(".ov-digit").first().text().replace(/\s+/g, " ").trim();
    const label = $(el).find(".ov-label").first().text().replace(/\s+/g, " ").trim().toLowerCase();
    if (/critical it load|it load|capacity/.test(label) || /\d+\s*MW$/i.test(digit)) {
      const mw = digit.match(/([\d.]+)\s*MW/i);
      if (mw?.[1]) power_mw = Number(mw[1]);
    } else if (/square feet|sq\.?\s*ft/.test(label)) {
      space_sqft = parseCompactNumber(digit.replace(/sq.*/i, "").trim());
    } else if (/acre/.test(label)) {
      site_acres = parseCompactNumber(digit);
    }
  });

  const codeM = h1.match(/\(([A-Z]{2,4}\d{1,2})\)/);
  const code = codeM?.[1] ?? null;
  const campus = campusFromSlug(urlSlug);
  const country = toCountryCode(countryFromSlug(urlSlug, continent)) ?? "US";
  const certs = extractCerts($(".overview-details, .datacenter-main").text());

  const city = campus.replace(/\s+I{1,3}$/, "");
  const name = `Vantage ${campus}`;

  return {
    record: {
      slug: slugify("vantage", urlSlug),
      name,
      operator: "Vantage Data Centers",
      campus,
      code,
      location: {
        address: null,
        city,
        region: regionFromSlug(urlSlug),
        country,
        postal_code: null,
        lat: null,
        lng: null,
      },
      status: "operational",
      specs: {
        power_mw,
        space_sqft: space_sqft != null ? Math.round(space_sqft) : null,
        space_sqm: null,
        tier: null,
        year_built: null,
        cooling: null,
        pue: null,
        site_acres,
      },
      certifications: certs.length ? certs : null,
      sources: [
        {
          source: "vantage-dc-com",
          source_id: urlSlug,
          source_url: url.replace(/\/$/, "/"),
          fetched_at: nowIso(),
          raw: { url, h1, continent, urlSlug, code, power_mw, space_sqft, site_acres },
        },
      ],
    },
  };
}

export async function scrapeVantage(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write("[vantage] starting — fetching sitemap\n");
  const urls = await fetchUrls();
  process.stderr.write(`[vantage] sitemap → ${urls.length} URLs\n`);

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
      if (n % 10 === 0 || n === urls.length) {
        process.stderr.write(`[vantage] parsed ${n}/${urls.length}\n`);
      }
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  accepted.sort((a, b) => (a as { slug: string }).slug.localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.vantage.jsonl", accepted);
  await writeRejected("vantage", rejected);
  process.stderr.write(`[vantage] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeVantage().catch((err) => {
    console.error("[vantage] fatal:", err);
    process.exit(1);
  });
}
