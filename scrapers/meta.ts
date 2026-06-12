/**
 * Meta data centers scraper.
 *
 * Meta publishes its global fleet at https://datacenters.atmeta.com/all-locations/
 * Each facility is a card with: STATE_OR_COUNTRY header, City name, dollar
 * investment, break-ground year, peak workers, operational jobs. We pull
 * only City + State/Country (the geocode/ingest pipeline does the rest).
 */
import { chromium } from "playwright";
import { writeJsonl, writeRejected, nowIso } from "./common/writer.ts";
import { slugify } from "./common/slug.ts";

const URL = "https://datacenters.atmeta.com/all-locations/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface ScrapedFacility {
  slug: string;
  name: string;
  operator: "Meta";
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
    source: "meta-com";
    source_id: string;
    source_url: string;
    fetched_at: string;
    raw: unknown;
  }>;
}

// Free-text header → ISO country / region info.
const HEADER_MAP: Record<string, { country: string; region: string | null }> = {
  SINGAPORE: { country: "SG", region: null },
  DENMARK: { country: "DK", region: null },
  IRELAND: { country: "IE", region: null },
  SWEDEN: { country: "SE", region: null },
  // US states — country US, region = state name
  ALABAMA: { country: "US", region: "Alabama" },
  ARIZONA: { country: "US", region: "Arizona" },
  GEORGIA: { country: "US", region: "Georgia" },
  IDAHO: { country: "US", region: "Idaho" },
  ILLINOIS: { country: "US", region: "Illinois" },
  INDIANA: { country: "US", region: "Indiana" },
  IOWA: { country: "US", region: "Iowa" },
  LOUISIANA: { country: "US", region: "Louisiana" },
  MINNESOTA: { country: "US", region: "Minnesota" },
  MISSOURI: { country: "US", region: "Missouri" },
  NEBRASKA: { country: "US", region: "Nebraska" },
  "NEW MEXICO": { country: "US", region: "New Mexico" },
  "NORTH CAROLINA": { country: "US", region: "North Carolina" },
  OHIO: { country: "US", region: "Ohio" },
  OKLAHOMA: { country: "US", region: "Oklahoma" },
  OREGON: { country: "US", region: "Oregon" },
  "SOUTH CAROLINA": { country: "US", region: "South Carolina" },
  TENNESSEE: { country: "US", region: "Tennessee" },
  TEXAS: { country: "US", region: "Texas" },
  UTAH: { country: "US", region: "Utah" },
  VIRGINIA: { country: "US", region: "Virginia" },
  WISCONSIN: { country: "US", region: "Wisconsin" },
  WYOMING: { country: "US", region: "Wyoming" },
};

export async function scrapeMeta(): Promise<{ accepted: number; rejected: number }> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  const page = await ctx.newPage();

  process.stderr.write(`[meta] navigating to ${URL}\n`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);

  // Pull (state, city, breakground_year) tuples by walking the body text.
  // Pattern per card: HEADER\n\nCity\n\n$… investment\n\nYYYY break ground\n...
  const body = await page.evaluate(() => document.body.innerText);
  await browser.close();

  const accepted: ScrapedFacility[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];

  const lines = body.split("\n").map((l) => l.trim());

  // City names start with a letter and don't contain spec keywords.
  const isPlausibleCity = (s: string) =>
    /^[A-Z][a-zA-Z]/.test(s) &&
    s.length < 60 &&
    !/(investment|billion|million|break ground|workers|jobs|construction|operational|completed)/i.test(s);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const header = HEADER_MAP[line];
    if (!header) continue;
    // Find next non-empty line that's a plausible city.
    let j = i + 1;
    while (j < lines.length && lines[j] === "") j++;
    if (j >= lines.length) continue;
    const city = lines[j]!;
    if (!isPlausibleCity(city)) continue;
    // Look forward up to 10 lines for "YYYY break ground".
    const lookahead = lines.slice(j + 1, j + 12).join(" ");
    const yearMatch = lookahead.match(/(\d{4})\s+break ground/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    const cityKey = header.region ? `${city}-${header.region}` : city;
    const slug = `meta-${slugify(cityKey)}-${header.country.toLowerCase()}`;
    const name = header.region ? `Meta ${city}, ${header.region}` : `Meta ${city}`;
    accepted.push({
      slug,
      name,
      operator: "Meta",
      campus: null,
      code: null,
      location: {
        address: null,
        city,
        region: header.region,
        country: header.country,
        postal_code: null,
        lat: null,
        lng: null,
      },
      status: "operational",
      specs: {
        power_mw: null,
        space_sqft: null,
        space_sqm: null,
        tier: null,
        year_built: year || null,
        cooling: null,
        pue: null,
        certifications: null,
      },
      sources: [
        {
          source: "meta-com",
          source_id: slug,
          source_url: URL,
          fetched_at: nowIso(),
          raw: { city, region: header.region, country: header.country, year_broke_ground: year },
        },
      ],
    });
    // Skip past this card so the outer loop doesn't re-pick a STATE_HEADER
    // that happens to live inside this card's spec lines.
    i = j;
  }

  // Deduplicate by slug (in case the parser picks the same card twice)
  const bySlug = new Map<string, ScrapedFacility>();
  for (const r of accepted) bySlug.set(r.slug, r);
  const finalAccepted = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  await writeJsonl("facilities.meta.jsonl", finalAccepted);
  await writeRejected("meta", rejected);
  process.stderr.write(`[meta] done — accepted=${finalAccepted.length} rejected=${rejected.length}\n`);
  return { accepted: finalAccepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeMeta().catch((err) => {
    console.error("[meta] fatal:", err);
    process.exit(1);
  });
}
