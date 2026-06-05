import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const ORIGIN = "https://www.equinix.com";
// The brief lists three region indexes. We crawl all three and union results.
const REGION_INDEXES = [
  `${ORIGIN}/data-centers/americas-colocation/united-states-colocation`,
  `${ORIGIN}/data-centers/europe-colocation`,
  `${ORIGIN}/data-centers/asia-pacific-colocation`,
];

// Equinix returns 403 to bot UAs. The brief calls this out — use a realistic
// browser UA and accept-language. No JS execution needed; plain HTML scrape.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface EquinixFacility {
  url: string;
  code: string;
  country_url_segment: string; // e.g. "united-states-colocation"
}

function deriveCountry(urlSegment: string): string | null {
  let m = urlSegment.replace(/-colocation$/, "").replace(/-/g, " ");
  // Equinix's URL slug for Côte d'Ivoire drops the apostrophe and 'C'/'I'
  // diacritics ("cote-divoire"), which the ISO library can't match.
  if (m === "cote divoire") return "CI";
  return toCountryCode(m);
}

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "equinix",
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

function extractFacilityUrlsFromCityPage(html: string, baseUrl: URL): EquinixFacility[] {
  const $ = load(html);
  const out: EquinixFacility[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, a) => {
    const raw = $(a).attr("href");
    if (!raw) return;
    const abs = new URL(raw, baseUrl).toString();
    // /data-centers/<region>-colocation/<country>-colocation/<city>-data-centers/<code>
    const m = abs.match(
      /^https:\/\/www\.equinix\.com\/data-centers\/([a-z-]+-colocation)\/([a-z-]+-colocation)\/[a-z-]+-data-centers\/([a-z0-9]+)\/?(?:$|\?)/
    );
    if (!m) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs.replace(/\/$/, ""), code: m[3]!, country_url_segment: m[2]! });
  });
  return out;
}

function extractCityUrlsFromRegionIndex(html: string, baseUrl: URL): string[] {
  const $ = load(html);
  const out = new Set<string>();
  $("a[href]").each((_, a) => {
    const raw = $(a).attr("href");
    if (!raw) return;
    const abs = new URL(raw, baseUrl).toString();
    // /data-centers/<region>-colocation/<country>-colocation/<city>-data-centers
    const m = abs.match(
      /^https:\/\/www\.equinix\.com\/data-centers\/([a-z-]+-colocation)\/([a-z-]+-colocation)\/[a-z-]+-data-centers\/?$/
    );
    if (m) out.add(abs.replace(/\/$/, ""));
  });
  return [...out];
}

interface SpecCard {
  title: string;
  metric: string;
  qualifier: string | null;
}

function extractSpecCards($: ReturnType<typeof load>, scope: ReturnType<typeof load> | null = null): SpecCard[] {
  const out: SpecCard[] = [];
  const root = scope ?? $;
  root('[data-role="metric"]').each((_, el) => {
    const $el = $(el);
    const card = $el.closest("div").parent();
    const title = card.find('[data-role="title"]').first().text().trim();
    const metric = $el.text().trim();
    const qualifier = card.find('[data-role="qualifier"]').first().text().trim() || null;
    if (metric) out.push({ title, metric, qualifier });
  });
  return out;
}

function findSpec(cards: SpecCard[], titleRe: RegExp): SpecCard | null {
  return cards.find((c) => titleRe.test(c.title)) ?? null;
}

function parseNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/[-+]?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseSqftAndSqm(spaceCard: SpecCard | null): { sqft: number | null; sqm: number | null } {
  if (!spaceCard) return { sqft: null, sqm: null };
  // The Building tab panel often has "1,852 m2 (19,935 ft2)" combined; the
  // visible card has "19,935" + qualifier "Square feet (ft²)".
  const text = `${spaceCard.metric} ${spaceCard.qualifier ?? ""}`;
  const ft = text.match(/([\d,]+)\s*(?:square feet|sq\.?\s*ft|ft²|ft2)/i);
  const m2 = text.match(/([\d,]+)\s*(?:m²|m2|square meters?)/i);
  return {
    sqft: parseNumber(ft?.[1]),
    sqm: parseNumber(m2?.[1]),
  };
}

function parseTabPanelKv(text: string): Record<string, string> {
  // Tab panel text is run-on but labels and values alternate. We split on the
  // known labels then trim. This is heuristic — we save raw text too.
  const labels = [
    "Colocation Space",
    "Building Description",
    "Parking",
    "Floor Load Capacity",
    "Flood Plain Info",
    "Seismic Design",
    "Fire Suppression System",
    "Fire Detection",
    "Minimum Cabinet Density",
    "Power Distribution",
    "UPS Redundancy",
    "Generator Redundancy",
    "Generator Autonomy",
    "Cooling Redundancy",
    "Security",
    "Amenities",
    "Sustainability",
  ];
  const out: Record<string, string> = {};
  for (const label of labels) {
    const re = new RegExp(`${label.replace(/\s+/g, "\\s+")}\\s+(.*?)(?=\\s+(?:${labels.map((l) => l.replace(/\s+/g, "\\s+")).join("|")})|$)`, "s");
    const m = text.match(re);
    if (m && m[1]) out[label] = m[1].trim().replace(/\s+/g, " ");
  }
  return out;
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

function extractCertifications(bodyText: string): string[] {
  const found = new Set<string>();
  for (const c of KNOWN_CERTS) {
    if (new RegExp(`\\b${c.replace(/[-./]/g, ".")}\\b`, "i").test(bodyText)) found.add(c);
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

function parseAddress($: ReturnType<typeof load>): ParsedAddress {
  const card = $('h2:contains("Address")').first().parent();
  if (!card.length) return { address: null, city: null, region: null, postal: null, country: null };
  const lines: string[] = [];
  card.find("ul li").each((_, li) => {
    const t = $(li).text().trim().replace(/\s+/g, " ");
    if (t) lines.push(t);
  });

  let address: string | null = null;
  let city: string | null = null;
  let region: string | null = null;
  let postal: string | null = null;
  let country: string | null = null;
  if (lines.length >= 1) address = lines[0] ?? null;

  // If the last line is a bare country name, peel it off first.
  const candidateLines = lines.slice(1);
  if (candidateLines.length > 0) {
    const last = candidateLines[candidateLines.length - 1]!;
    if (/^[A-Za-z .'-]+$/.test(last) && last.length <= 30) {
      const cc = toCountryCode(last);
      if (cc) {
        country = cc;
        candidateLines.pop();
      }
    }
  }

  for (const ln of candidateLines) {
    if (city && postal) break;
    // US: "Ashburn, VA 20147"
    const usM = ln.match(/^([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
    if (usM && !city) {
      city = usM[1]!.trim();
      region = usM[2]!.trim();
      postal = usM[3]!.trim();
      continue;
    }
    // German / European: "60326 Frankfurt" (postal first, then city)
    const dePost = ln.match(/^(\d{4,5})\s+([A-Za-zÀ-ÿ .'-]+)$/);
    if (dePost && !city) {
      postal = dePost[1]!.trim();
      city = dePost[2]!.trim();
      continue;
    }
    // UK: "E14 9GE London" (alphanumeric postal + city)
    const ukPost = ln.match(/^([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s+(.+)$/);
    if (ukPost && !city) {
      postal = ukPost[1]!.trim();
      city = ukPost[2]!.trim();
      continue;
    }
    // Japan / generic: "Tokyo, 143 0006" (city first, then postal)
    const cityPostM = ln.match(/^([^,]+),\s*(\d[\w\s-]*)$/);
    if (cityPostM && !city) {
      city = cityPostM[1]!.trim();
      postal = cityPostM[2]!.trim();
      continue;
    }
    // Bare city (e.g. just "Limeharbour" — drop as district, not the metro)
    // Skip lines that look like apartment / suite / building extras.
    if (/^(?:Suite|Building|Block|Floor|Level|Unit|TRC)/i.test(ln)) continue;
    // If we still don't have a city, take a bare-text line as a fallback.
    if (!city && /^[A-Za-zÀ-ÿ .'-]+$/.test(ln) && ln.length <= 40) {
      city = ln;
    }
  }
  return { address, city, region, postal, country };
}

function parsePower(cards: SpecCard[]): { redundancy: string | null } {
  const c = findSpec(cards, /^Power$/i);
  if (!c) return { redundancy: null };
  // Visible card holds e.g. "2N" + qualifier "Power redundancy". Equinix does
  // not publish the MW capacity on the public page, so we capture redundancy.
  const m = c.metric.match(/^(N\+?\d?|2N(?:\+\d)?|\d?N)$/i);
  return { redundancy: m ? m[0] : c.metric || null };
}

function parseCooling(cards: SpecCard[]): { redundancy: string | null } {
  const c = findSpec(cards, /cooling/i);
  if (!c) return { redundancy: null };
  return { redundancy: c.metric || null };
}

function parseUptime(cards: SpecCard[]): string | null {
  const c = findSpec(cards, /reliability/i);
  return c?.metric ?? null;
}

function parseMinCabinetKw(kv: Record<string, string>): number | null {
  // "Minimum Cabinet Density" reads as "2kVA" or "5 kW" etc. kVA ≈ kW for
  // these spec sheets (PF ~0.95–1.0); the brief treats them as equivalent.
  const v = kv["Minimum Cabinet Density"];
  if (!v) return null;
  const m = v.match(/([\d.]+)\s*k(?:V?A|W)/i);
  return m ? Number(m[1]) : null;
}

function buildName(code: string, city: string | null): string {
  // Match the brand convention: "Equinix DC1" (operator+code), city in location.
  return `Equinix ${code.toUpperCase()}`;
}

function buildSlug(code: string, city: string | null): string {
  return slugify("equinix", code, city ?? "");
}

interface RawSpecBlock {
  url: string;
  h1: string;
  code: string;
  address_lines: string[];
  spec_cards: SpecCard[];
  tab_panels: Record<string, string>;
  certifications_text_matches: string[];
}

function parseFacility(url: string, html: string, countrySegment: string): unknown | { _reject: string } {
  const $ = load(html);
  const h1 = $("h1").first().text().trim().replace(/\s+/g, " ");
  const code = url.split("/").pop()!.toLowerCase();
  const cards = extractSpecCards($);
  const addr = parseAddress($);
  const tab1 = $("#tabpanel-specs-tabs-1").text().replace(/\s+/g, " ").trim();
  const tab2 = $("#tabpanel-specs-tabs-2").text().replace(/\s+/g, " ").trim();
  const tab3 = $("#tabpanel-specs-tabs-3").text().replace(/\s+/g, " ").trim();
  const tabs = { building: tab1, facilities: tab2, sustainability: tab3 };
  const kv = { ...parseTabPanelKv(tab1), ...parseTabPanelKv(tab2), ...parseTabPanelKv(tab3) };
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const certs = extractCertifications(bodyText);

  const country = addr.country ?? deriveCountry(countrySegment);
  if (!country) {
    return { _reject: `country: could not derive from address or url segment '${countrySegment}'` };
  }

  // Prefer the Building tab "Colocation Space" since it gives both sqft and sqm.
  const spaceCard = findSpec(cards, /^space$/i) ?? null;
  const spaceCombined: SpecCard | null = kv["Colocation Space"]
    ? { title: "Colocation Space", metric: kv["Colocation Space"], qualifier: null }
    : spaceCard;
  const { sqft, sqm } = parseSqftAndSqm(spaceCombined);

  const power = parsePower(cards);
  const cooling = parseCooling(cards);
  const reliability = parseUptime(cards);
  const minCabKw = parseMinCabinetKw(kv);

  const raw: RawSpecBlock = {
    url,
    h1,
    code,
    address_lines: (() => {
      const card = $('h2:contains("Address")').first().parent();
      return card.find("ul li").map((_, li) => $(li).text().trim().replace(/\s+/g, " ")).get().filter(Boolean);
    })(),
    spec_cards: cards,
    tab_panels: tabs,
    certifications_text_matches: certs,
  };

  return {
    slug: buildSlug(code, addr.city),
    name: buildName(code, addr.city),
    operator: "Equinix",
    campus: null,
    code: code.toUpperCase(),
    location: {
      address: addr.address,
      city: addr.city,
      region: addr.region,
      country,
      postal_code: addr.postal,
      lat: null,
      lng: null,
    },
    status: "operational",
    specs: {
      power_mw: null,
      power_redundancy: power.redundancy,
      space_sqft: sqft,
      space_sqm: sqm,
      raised_floor_sqft: null,
      min_cabinet_density_kw: minCabKw,
      max_cabinet_density_kw: null,
      tier: null,
      year_built: null,
      year_opened: null,
      cooling: kv["Cooling Redundancy"] ? `Redundancy ${kv["Cooling Redundancy"]}` : null,
      cooling_redundancy: cooling.redundancy,
      pue: null,
      uptime_sla: reliability,
      generator_redundancy: kv["Generator Redundancy"] ?? null,
      generator_autonomy: kv["Generator Autonomy"] ?? null,
      ups_redundancy: kv["UPS Redundancy"] ?? null,
      power_distribution: kv["Power Distribution"] ?? null,
      building_description: kv["Building Description"] ?? null,
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
        source: "equinix-com",
        source_id: code,
        source_url: url,
        fetched_at: nowIso(),
        raw,
      },
    ],
  };
}

export async function scrapeEquinix(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[equinix] starting — 3 region indexes\n`);

  // Pass 1: region indexes → city URLs
  const cityUrls = new Set<string>();
  for (const region of REGION_INDEXES) {
    try {
      const html = await politeFetch(region);
      const cities = extractCityUrlsFromRegionIndex(html, new URL(region));
      cities.forEach((u) => cityUrls.add(u));
      process.stderr.write(`[equinix] region ${new URL(region).pathname} → ${cities.length} city pages\n`);
    } catch (e) {
      process.stderr.write(`[equinix] region ${region} FAILED: ${(e as Error).message}\n`);
    }
  }

  // Pass 2: city URLs → facility URLs
  const facilities = new Map<string, EquinixFacility>();
  for (const cityUrl of [...cityUrls].sort()) {
    try {
      const html = await politeFetch(cityUrl);
      const f = extractFacilityUrlsFromCityPage(html, new URL(cityUrl));
      for (const fac of f) facilities.set(fac.url, fac);
    } catch (e) {
      process.stderr.write(`[equinix] city ${cityUrl} FAILED: ${(e as Error).message}\n`);
    }
  }
  process.stderr.write(`[equinix] discovered ${facilities.size} facility URLs across ${cityUrls.size} cities\n`);

  // Pass 3: facility pages → parse spec block
  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  let n = 0;
  for (const fac of [...facilities.values()].sort((a, b) => a.url.localeCompare(b.url))) {
    n++;
    try {
      const html = await politeFetch(fac.url);
      const parsed = parseFacility(fac.url, html, fac.country_url_segment);
      if (parsed && typeof parsed === "object" && "_reject" in parsed) {
        rejected.push({ record: { url: fac.url, code: fac.code }, reason: (parsed as { _reject: string })._reject });
      } else {
        accepted.push(parsed);
      }
      if (n % 25 === 0 || n === facilities.size) {
        process.stderr.write(`[equinix] parsed ${n}/${facilities.size}\n`);
      }
    } catch (e) {
      rejected.push({ record: { url: fac.url, code: fac.code }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.equinix.jsonl", accepted);
  await writeRejected("equinix", rejected);

  process.stderr.write(`[equinix] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeEquinix().catch((err) => {
    console.error("[equinix] fatal:", err);
    process.exit(1);
  });
}
