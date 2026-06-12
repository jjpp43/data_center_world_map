/**
 * Iron Mountain data centers scraper.
 *
 * Iron Mountain's site is hosted on Vercel with the Security Checkpoint
 * enabled, which 429s undici with `x-vercel-mitigated: challenge`. Playwright
 * runs a real Chromium so the challenge auto-resolves via JS.
 *
 * Pipeline:
 *   1. Parse the sitemap index + sub-sitemaps via raw fetch (sitemap.xml is
 *      not gated; only HTML pages are).
 *   2. Filter URLs matching /data-centers/locations/{slug}-data-center.
 *   3. For each URL, visit in Playwright, extract code/specs/text.
 *   4. Output to facilities.ironmountain.jsonl in the same schema as the
 *      other operator scrapers. lat/lng stays null — the canonicalize
 *      pipeline geocodes via Mapbox during ingest.
 */
import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import { writeJsonl, writeRejected, nowIso } from "./common/writer.ts";
import { slugify } from "./common/slug.ts";

const BASE = "https://www.ironmountain.com";
const LISTINGS_URL = `${BASE}/data-centers/locations`;
const FACILITY_URL_RE = /^https:\/\/www\.ironmountain\.com\/data-centers\/locations\/[a-z0-9-]+-data-center\/?$/i;
const SLUG_FROM_URL_RE = /\/data-centers\/locations\/([a-z0-9-]+)\/?$/i;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DELAY_MS = 1500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ScrapedFacility {
  slug: string;
  name: string;
  operator: string;
  campus: string | null;
  code: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
  };
  status: "operational";
  specs: {
    power_mw: number | null;
    space_sqft: number | null;
    space_sqm: number | null;
    tier: string | null;
    year_built: number | null;
    cooling: string | null;
    pue: number | null;
    certifications: string[] | null;
  };
  sources: Array<{
    source: "ironmountain-com";
    source_id: string;
    source_url: string;
    fetched_at: string;
    raw: unknown;
  }>;
}

async function listFacilityUrls(page: Page): Promise<string[]> {
  process.stderr.write(`[ironmountain] navigating to listings page ${LISTINGS_URL}\n`);
  await page.goto(LISTINGS_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((h, i, arr) => arr.indexOf(h) === i),
  );
  const facilities = hrefs
    .filter((h) => FACILITY_URL_RE.test(h))
    .map((h) => h.replace(/\/$/, ""));
  return [...new Set(facilities)].sort();
}

interface ExtractResult {
  code: string | null;
  city: string | null;
  region: string | null;
  country: string;
  address: string | null;
  power_mw: number | null;
  space_sqft: number | null;
  certifications: string[] | null;
  description: string;
  h1: string;
}

const KNOWN_CERTS = [
  "LEED Gold", "LEED Platinum", "LEED Silver",
  "FISMA High", "FISMA Moderate", "FedRAMP", "FedRAMP High", "FedRAMP Moderate",
  "HIPAA", "PCI DSS", "PCI-DSS", "NIST 800-53", "NIST 800-171",
  "SOC 1", "SOC 2", "SOC 3",
  "ISO 9001", "ISO 14001", "ISO 22301", "ISO 27001", "ISO 27017", "ISO 27018", "ISO 50001",
  "HITRUST", "Uptime Tier III", "Uptime Tier IV",
];

async function extractFacility(page: Page, url: string): Promise<ExtractResult | null> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);
  const data = await page.evaluate(() => {
    const h1 = document.querySelector("h1")?.textContent?.trim() ?? "";
    const bodyText = document.body.innerText;
    return { h1, bodyText };
  });
  if (!data.h1) return null;

  const text = data.bodyText;

  // Facility code: "Iron Mountain BOS-1" or "BOS-1, our data center"
  const codeMatch = text.match(/\b([A-Z]{2,4}-\d{1,2})\b/);
  const code = codeMatch?.[1] ?? null;

  // Power MW: "3.6 MW of total critical power" or "3.6 MW critical"
  const mwMatch = text.match(/(\d+(?:\.\d+)?)\s*MW\b[^.]{0,40}(?:critical|power|capacity|IT load)/i)
    ?? text.match(/(\d+(?:\.\d+)?)\s*MW\b/);
  const power_mw = mwMatch ? Number(mwMatch[1]) : null;

  // Space sqft: "22,000 square foot" or "22,000 sq ft" or "22,000 sqft"
  const sqftMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:square\s*(?:foot|feet)|sq\.?\s*ft\.?|sqft)\b/i);
  const space_sqft = sqftMatch?.[1] ? Number(sqftMatch[1].replace(/,/g, "")) : null;

  // City from h1: "Boston data center" → "Boston"
  const cityFromH1 = data.h1.replace(/\s*data\s*center.*$/i, "").trim();

  // Address: look for street-style patterns. Iron Mountain rarely shows full
  // address on the public page; we'll let the canonicalize pipeline geocode
  // city + country via Mapbox.
  const address: string | null = null;

  // Country guess: most IM facilities are US; country is rendered as a
  // page header ("United States", "United Kingdom", etc.). Grab from JSON-LD
  // or fall back to US for the .com domain.
  const ldJson = (
    await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => s.textContent ?? "")
        .join("\n"),
    )
  ).toLowerCase();
  let country = "US";
  if (ldJson.includes("/united-kingdom") || /united kingdom|england|london|\bgb\b/i.test(text.slice(0, 1500))) country = "GB";
  else if (/germany|frankfurt|berlin/i.test(text.slice(0, 1500))) country = "DE";
  else if (/india|mumbai|bengaluru|bangalore|chennai|noida|hyderabad/i.test(text.slice(0, 1500))) country = "IN";
  else if (/singapore/i.test(text.slice(0, 1500))) country = "SG";
  else if (/netherlands|amsterdam/i.test(text.slice(0, 1500))) country = "NL";

  const certifications = KNOWN_CERTS.filter((c) => text.includes(c));

  return {
    code,
    city: cityFromH1 || null,
    region: null,
    country,
    address,
    power_mw,
    space_sqft,
    certifications: certifications.length ? certifications : null,
    description: text.slice(0, 2000),
    h1: data.h1,
  };
}

function urlSlug(url: string): string {
  const m = url.match(SLUG_FROM_URL_RE);
  return m?.[1] ?? slugify(url);
}

function buildRecord(url: string, ex: ExtractResult): ScrapedFacility {
  const u = urlSlug(url);
  const codeSlug = ex.code ? slugify(ex.code).replace(/-+/g, "-") : "";
  const slug = `ironmountain-${codeSlug ? `${codeSlug}-` : ""}${u}`.slice(0, 240);
  const name = ex.code ? `Iron Mountain ${ex.code}` : ex.h1;
  return {
    slug,
    name,
    operator: "Iron Mountain",
    campus: null,
    code: ex.code,
    location: {
      address: ex.address,
      city: ex.city,
      region: ex.region,
      country: ex.country,
      postal_code: null,
      lat: null,
      lng: null,
    },
    status: "operational",
    specs: {
      power_mw: ex.power_mw,
      space_sqft: ex.space_sqft,
      space_sqm: null,
      tier: null,
      year_built: null,
      cooling: null,
      pue: null,
      certifications: ex.certifications,
    },
    sources: [
      {
        source: "ironmountain-com",
        source_id: u,
        source_url: url,
        fetched_at: nowIso(),
        raw: {
          url,
          h1: ex.h1,
          code: ex.code,
          city: ex.city,
          country: ex.country,
          power_mw: ex.power_mw,
          space_sqft: ex.space_sqft,
          certifications: ex.certifications,
          description: ex.description,
        },
      },
    ],
  };
}

async function withBrowser<T>(fn: (browser: Browser, ctx: BrowserContext) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  try {
    return await fn(browser, ctx);
  } finally {
    await browser.close();
  }
}

export async function scrapeIronMountain(): Promise<{ accepted: number; rejected: number }> {
  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];

  await withBrowser(async (_browser, ctx) => {
    const page = await ctx.newPage();
    const urls = await listFacilityUrls(page);
    process.stderr.write(`[ironmountain] sitemap → ${urls.length} facility URLs\n`);
    if (urls.length === 0) {
      process.stderr.write(`[ironmountain] no URLs; aborting\n`);
      return;
    }
    let n = 0;
    for (const url of urls) {
      n++;
      try {
        const ex = await extractFacility(page, url);
        if (!ex) {
          rejected.push({ record: { url }, reason: "extract returned null (h1 missing)" });
          continue;
        }
        const rec = buildRecord(url, ex);
        accepted.push(rec);
        if (n % 10 === 0 || n === urls.length) {
          process.stderr.write(`[ironmountain] ${n}/${urls.length} parsed\n`);
        }
      } catch (e) {
        rejected.push({ record: { url }, reason: `extract error: ${(e as Error).message}` });
      }
      await sleep(DELAY_MS);
    }
  });

  accepted.sort((a, b) =>
    (a as { slug: string }).slug.localeCompare((b as { slug: string }).slug),
  );
  await writeJsonl("facilities.ironmountain.jsonl", accepted);
  await writeRejected("ironmountain", rejected);
  process.stderr.write(`[ironmountain] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeIronMountain().catch((err) => {
    console.error("[ironmountain] fatal:", err);
    process.exit(1);
  });
}
