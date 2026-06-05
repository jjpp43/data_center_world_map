import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

// QTS rebranded the consumer site to q.com; the old qtsdatacenters.com domain
// 301s to it. The index lists every campus as a direct anchor.
const INDEX_URL = "https://q.com/data-centers/";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE = /^https:\/\/q\.com\/data-centers\/([a-z0-9-]+)\/?$/;

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "qts",
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
  const html = await politeFetch(INDEX_URL);
  const $ = load(html);
  const out = new Set<string>();
  $("a[href]").each((_, a) => {
    const h = $(a).attr("href");
    if (!h) return;
    const abs = new URL(h, INDEX_URL).toString().replace(/\/$/, "/");
    if (FACILITY_URL_RE.test(abs)) out.add(abs);
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

interface ParsedAddress {
  address: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  country: string | null;
}

// QTS pages list addresses like "DC1: 22271 Broderick Drive, Sterling VA 20166"
// or just "22271 Broderick Drive, Sterling, VA 20166" for single-building sites.
function parseQtsAddress(text: string): ParsedAddress | null {
  // US pattern with optional building prefix
  const us =
    text.match(/(?:DC\d+:\s*)?(\d{1,6}\s+[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,5}),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (us && us[1] && us[2] && us[3] && us[4]) {
    return { address: us[1].trim(), city: us[2].trim(), region: us[3].trim(), postal: us[4].trim(), country: "US" };
  }
  // International fallback: "<street>, <city>, <country>"
  return null;
}

interface QtsSpecs {
  power_mw_total: number | null;
  power_mw_dc1: number | null;
  acres: number | null;
}

// QTS campus pages list power per DC building. The text after cheerio's text()
// extraction often has NO space between "DC1" and the next number — e.g.
// "...in DC122.5 MW..." — so we can't anchor on the DC<n> suffix safely.
// Instead we anchor on the phrase "<N> MW+ of critical power capacity" which
// is repeated for every DC building, and dedupe by MW value to drop any
// rephrased duplicates ("Critical campus capacity 55 MW+" appears once at
// the bottom of every page).
function parseQtsSpecs(text: string): QtsSpecs {
  // q.com's rendered text concatenates "DC1" with the next sentence ("...in
  // DC122.5 MW+ ..."), making the boundary unparseable. Restore the boundary
  // by injecting a space whenever DC<digit> is immediately followed by a
  // digit. QTS campuses go up to a few DC buildings; the digit after the
  // building number always starts the next sentence's value.
  const normalized = text.replace(/(DC\d)(?=\d)/g, "$1 ");

  // After normalization, "<N> MW+ of critical power capacity" reliably
  // appears once per DC building.
  const re = /([\d.]+)\s*MW\s*\+?\s*of\s+critical\s+power\s+capacity/gi;
  const seen = new Set<string>();
  let total: number | null = null;
  for (const m of normalized.matchAll(re)) {
    const raw = m[1];
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    const mw = Number(raw);
    if (Number.isFinite(mw)) total = (total ?? 0) + mw;
  }
  // Fallback for single-building campuses without the "capacity" suffix.
  if (total === null) {
    const lone = normalized.match(/([\d.]+)\s*MW\+?\s+of\s+critical\s+power\b/i);
    if (lone && lone[1]) {
      const mw = Number(lone[1]);
      if (Number.isFinite(mw)) total = mw;
    }
  }
  const acres = normalized.match(/([\d.]+)[-\s]*acre/i);
  return {
    power_mw_total: total,
    power_mw_dc1: null,
    acres: acres && acres[1] ? Number(acres[1]) : null,
  };
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFacility(url: string, html: string): { record: unknown } | { _reject: string } {
  const $ = load(html);
  const m = url.match(FACILITY_URL_RE);
  if (!m || !m[1]) return { _reject: `url does not match: ${url}` };
  const urlSlug = m[1];

  const h1 = $("h1").first().text().trim().replace(/\s+/g, " ");
  if (!h1) return { _reject: "empty h1" };

  // The body text concatenates header nav + main + footer. Scope to the
  // section starting at the h1 so we don't pick up other campuses.
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const h1Idx = bodyText.indexOf(h1);
  const window = h1Idx >= 0 ? bodyText.slice(h1Idx, h1Idx + 6000) : bodyText;

  const addr = parseQtsAddress(window) ?? parseQtsAddress(bodyText);
  const specs = parseQtsSpecs(window);
  const certs = extractCerts(window);

  const code = urlSlug.toUpperCase();
  const name = `QTS ${toTitleCase(urlSlug.replace(/-/g, " "))}`;
  const city = addr?.city ?? toTitleCase(urlSlug.replace(/-\d+$/, "").replace(/-/g, " "));

  return {
    record: {
      slug: slugify("qts", code, city),
      name,
      operator: "QTS",
      campus: h1,
      code,
      location: {
        address: addr?.address ?? null,
        city,
        region: addr?.region ?? null,
        country: toCountryCode(addr?.country ?? null) ?? "US",
        postal_code: addr?.postal ?? null,
        lat: null,
        lng: null,
      },
      status: "operational",
      specs: {
        power_mw: specs.power_mw_total,
        power_redundancy: null,
        space_sqft: null,
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
        power_mw_dc1: specs.power_mw_dc1,
      },
      connectivity: { carriers_count: null, ixps_count: null, meet_me_rooms: null, cross_connects_count: null },
      certifications: certs.length ? certs : null,
      security: null,
      media: { photos: null, website: url, datasheet_url: null },
      sources: [
        {
          source: "qtsdatacenters-com",
          source_id: urlSlug,
          source_url: url,
          fetched_at: nowIso(),
          raw: { url, h1, url_slug: urlSlug, specs, address: addr },
        },
      ],
    },
  };
}

export async function scrapeQts(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[qts] starting — fetching index\n`);
  const urls = await fetchFacilityUrls();
  process.stderr.write(`[qts] index → ${urls.length} facility URLs\n`);

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
      if (n % 10 === 0 || n === urls.length) process.stderr.write(`[qts] parsed ${n}/${urls.length}\n`);
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }
  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.qts.jsonl", accepted);
  await writeRejected("qts", rejected);
  process.stderr.write(`[qts] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeQts().catch((err) => {
    console.error("[qts] fatal:", err);
    process.exit(1);
  });
}
