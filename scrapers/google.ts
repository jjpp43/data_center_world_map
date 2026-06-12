/**
 * Google data center scraper.
 *
 * Google publishes the full list of their hyperscale data centers on a
 * single page (https://datacenters.google/locations/) — grouped by region,
 * one line per location: "City, Country" or "City, Country (in development)".
 *
 * The site is on Google's frontend, no Vercel checkpoint, but it's a SPA
 * that renders the list with JS — so Playwright is the simplest path.
 *
 * No per-facility pages exist; we extract everything from the listings page.
 * lat/lng is null — the ingest pipeline geocodes via Mapbox.
 */
import { chromium } from "playwright";
import { writeJsonl, writeRejected, nowIso } from "./common/writer.ts";
import { slugify } from "./common/slug.ts";

const URL = "https://datacenters.google/locations/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface ScrapedFacility {
  slug: string;
  name: string;
  operator: "Google";
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
  status: "operational" | "planned";
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
    source: "google-com";
    source_id: string;
    source_url: string;
    fetched_at: string;
    raw: unknown;
  }>;
}

// Free-text country names → ISO 3166-1 alpha-2.
const COUNTRY_MAP: Record<string, string> = {
  India: "IN",
  Taiwan: "TW",
  Thailand: "TH",
  Japan: "JP",
  Malaysia: "MY",
  Singapore: "SG",
  Ireland: "IE",
  Netherlands: "NL",
  Germany: "DE",
  Belgium: "BE",
  Denmark: "DK",
  Finland: "FI",
  Sweden: "SE",
  Austria: "AT",
  Norway: "NO",
  "United Kingdom": "GB",
  UK: "GB",
  Uruguay: "UY",
  Chile: "CL",
  // North America: state name → US
  Texas: "US", Iowa: "US", Ohio: "US", Virginia: "US", Oregon: "US",
  "South Carolina": "US", Georgia: "US", Nevada: "US", Minnesota: "US",
  Indiana: "US", Alabama: "US", Missouri: "US", "North Carolina": "US",
  Nebraska: "US", Oklahoma: "US", Arizona: "US", Tennessee: "US",
  Arkansas: "US",
};

// Locations like "Council Bluffs, Iowa" → ("Council Bluffs", US, region="Iowa")
// Locations like "Singapore" (single name) → city=Singapore, country=SG, region=null.
function parseLocationLine(line: string): {
  city: string;
  region: string | null;
  country: string;
  inDevelopment: boolean;
} | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const inDevelopment = /\(in development\)$/i.test(trimmed);
  const clean = trimmed.replace(/\s*\(in development\)\s*$/i, "").trim();
  // Two-part: "City, Place"
  const parts = clean.split(",").map((s) => s.trim());
  if (parts.length === 1) {
    const single = parts[0]!;
    // "Singapore", "Central Ohio", "Indiana", "Northern Virginia"
    const cc = COUNTRY_MAP[single];
    if (cc) {
      return { city: single, region: null, country: cc, inDevelopment };
    }
    // Try matching trailing word as a region (e.g. "Central Ohio" → Ohio)
    const words = single.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const cand = words.slice(i).join(" ");
      if (COUNTRY_MAP[cand]) {
        return {
          city: single,
          region: cand,
          country: COUNTRY_MAP[cand],
          inDevelopment,
        };
      }
    }
    return null;
  }
  const [city, tail] = [parts[0]!, parts[1]!];
  // "Council Bluffs, Iowa" — Iowa is a state, so US
  // "Dublin, Ireland" — Ireland is a country
  // "Hanau, Germany" — Germany is a country
  const cc = COUNTRY_MAP[tail];
  if (!cc) return null;
  // If tail is a US state, it's the "region", country=US
  const isUsState = cc === "US";
  return {
    city,
    region: isUsState ? tail : null,
    country: cc,
    inDevelopment,
  };
}

export async function scrapeGoogle(): Promise<{ accepted: number; rejected: number }> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  const page = await ctx.newPage();

  process.stderr.write(`[google] navigating to ${URL}\n`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);

  const rawText = await page.evaluate(() => document.body.innerText);
  await browser.close();

  // Find "All locations" section and parse subsequent region groups until
  // the "Latest news" / footer block.
  const allStart = rawText.indexOf("All locations");
  const newsStart = rawText.indexOf("Latest news");
  if (allStart === -1 || newsStart === -1) {
    process.stderr.write(`[google] couldn't locate listing section\n`);
    return { accepted: 0, rejected: 0 };
  }
  const region = rawText.slice(allStart, newsStart);

  const REGION_HEADERS = ["ASIA", "EUROPE", "NORTH AMERICA", "SOUTH AMERICA"];
  const accepted: ScrapedFacility[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];

  const lines = region
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Note:") && l !== "All locations" && l !== "Clear Filter");

  let currentRegion: string | null = null;
  for (const line of lines) {
    if (REGION_HEADERS.includes(line.toUpperCase())) {
      currentRegion = line;
      continue;
    }
    if (!currentRegion) continue;
    const parsed = parseLocationLine(line);
    if (!parsed) {
      rejected.push({ record: { line, region: currentRegion }, reason: "unparseable location line" });
      continue;
    }
    const cityKey = parsed.region ? `${parsed.city}-${parsed.region}` : parsed.city;
    const slug = `google-${slugify(cityKey)}-${parsed.country.toLowerCase()}`;
    const name = parsed.region
      ? `Google ${parsed.city}, ${parsed.region}`
      : `Google ${parsed.city}`;
    accepted.push({
      slug,
      name,
      operator: "Google",
      campus: null,
      code: null,
      location: {
        address: null,
        city: parsed.city,
        region: parsed.region,
        country: parsed.country,
        postal_code: null,
        lat: null,
        lng: null,
      },
      status: parsed.inDevelopment ? "planned" : "operational",
      specs: {
        power_mw: null,
        space_sqft: null,
        space_sqm: null,
        tier: null,
        year_built: null,
        cooling: null,
        pue: null,
        certifications: null,
      },
      sources: [
        {
          source: "google-com",
          source_id: slug,
          source_url: URL,
          fetched_at: nowIso(),
          raw: { city: parsed.city, region: parsed.region, country: parsed.country, inDevelopment: parsed.inDevelopment },
        },
      ],
    });
  }

  accepted.sort((a, b) => a.slug.localeCompare(b.slug));
  await writeJsonl("facilities.google.jsonl", accepted);
  await writeRejected("google", rejected);
  process.stderr.write(`[google] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeGoogle().catch((err) => {
    console.error("[google] fatal:", err);
    process.exit(1);
  });
}
