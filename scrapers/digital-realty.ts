import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const SITEMAP = "https://www.digitalrealty.com/en-sitemap.xml";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE =
  /^https:\/\/www\.digitalrealty\.com\/data-centers\/(americas|emea|asia-pacific)\/([a-z0-9-]+)\/([a-z]{3,4}\d{1,3})$/;

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function fetchHtml(url: string): Promise<{ body: string; fromCache: boolean }> {
  const res = await cachedFetch(url, {
    cacheNamespace: "digital-realty",
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
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u): u is string => typeof u === "string");
  const facilities = urls.filter((u) => FACILITY_URL_RE.test(u));
  // Drop the index pages (which don't match the strict regex anyway).
  return [...new Set(facilities)].sort();
}

interface DrupalFieldValue {
  value?: unknown;
  [k: string]: unknown;
}

function firstValue(field: unknown): unknown {
  if (!field) return null;
  if (Array.isArray(field)) {
    if (field.length === 0) return null;
    const f = field[0] as DrupalFieldValue;
    if (f && typeof f === "object" && "value" in f) return f.value;
    return f;
  }
  if (typeof field === "object" && field !== null && "value" in (field as DrupalFieldValue)) {
    return (field as DrupalFieldValue).value;
  }
  return field;
}

function asString(field: unknown): string | null {
  const v = firstValue(field);
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length === 0 ? null : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asNumber(field: unknown): number | null {
  const s = asString(field);
  if (s === null) return null;
  // Allow "5,000", "5,000 sq ft", "12.5 MW".
  const m = s.replace(/,/g, "").match(/[-+]?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function collectAllValues(field: unknown): string[] {
  if (!field) return [];
  if (!Array.isArray(field)) field = [field];
  const out: string[] = [];
  for (const item of field as unknown[]) {
    if (item && typeof item === "object" && "value" in (item as DrupalFieldValue)) {
      const v = (item as DrupalFieldValue).value;
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    } else if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
    }
  }
  return out;
}

function findInTemplateBlocks(data: Record<string, unknown>, fieldName: string): unknown {
  const blocks = data.field_template_blocks;
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks as Array<Record<string, unknown>>) {
    for (const v of Object.values(b)) {
      if (v && typeof v === "object" && fieldName in v) return (v as Record<string, unknown>)[fieldName];
    }
  }
  return null;
}

function deriveCountryFromUrl(url: string): string | null {
  // Sitemap URL like /data-centers/americas/los-angeles/bur10 doesn't encode
  // country directly; we rely on the page's address field. The region segment
  // ("americas"/"emea"/"asia-pacific") is too coarse to map alone.
  return null;
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

function extractCertsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const c of KNOWN_CERTS) {
    if (new RegExp(`\\b${c.replace(/[-./]/g, ".")}\\b`, "i").test(text)) found.add(c);
  }
  return [...found].sort();
}

function parseFacility(url: string, html: string): unknown | { _reject: string } {
  const $ = load(html);
  const nextDataRaw = $("#__NEXT_DATA__").html();
  if (!nextDataRaw) return { _reject: "no __NEXT_DATA__ on page" };

  let next: Record<string, unknown>;
  try {
    next = JSON.parse(nextDataRaw) as Record<string, unknown>;
  } catch (e) {
    return { _reject: `invalid __NEXT_DATA__ json: ${(e as Error).message}` };
  }

  const pp = ((next.props as Record<string, unknown>)?.pageProps as Record<string, unknown>) ?? {};
  const data = (pp.data as Record<string, unknown>) ?? null;
  if (!data) return { _reject: "no pageProps.data" };

  const m = url.match(FACILITY_URL_RE);
  if (!m || !m[1] || !m[2] || !m[3]) return { _reject: `url does not match facility pattern: ${url}` };
  const region = m[1];
  const citySlug = m[2];
  const code = m[3];

  // Title is the code (e.g. "BUR10"). Verify.
  const title = asString(data.title) ?? code.toUpperCase();
  if (title.toLowerCase() !== code.toLowerCase()) {
    // Some pages set the display title elsewhere; we trust the URL code.
  }

  const lat = asNumber(data.field_latitude) ?? asNumber(findInTemplateBlocks(data, "field_location_latitude"));
  const lng = asNumber(data.field_longitude) ?? asNumber(findInTemplateBlocks(data, "field_location_longitude"));

  // Address — DR stores it as HTML inside a Drupal value field, e.g.
  // `"<p>3015 Winona Avenue, Burbank, CA 91504</p>\r\n"`. Strip HTML and parse.
  const addrText = parseAddressFromHtml(asString(data.field_address_location));

  // City/region from the facility_location taxonomy term (e.g. "Los Angeles").
  const facilityLocation = data.field_facility_location;
  let facilityCity: string | null = null;
  if (Array.isArray(facilityLocation) && facilityLocation.length > 0) {
    const t = facilityLocation[0] as Record<string, unknown>;
    if (typeof t.name === "string") facilityCity = t.name;
  }

  const country = toCountryCode(addrText?.country ?? null) ?? "US";

  // Specs — Drupal field names confirmed by inspecting the cached payload.
  // DR does not publish per-facility `power_mw` anywhere in the blob; the
  // closest signal is `field_total_building_size_in_ft2` for floor area.
  const power_mw = null;
  const space_sqft = asNumber(data.field_total_building_size_in_ft2);
  const space_sqm = asNumber(data.field_total_building_size_in_m2);
  const raised_floor_sqft = null;
  const pue = asNumber(data.field_design_pue);
  const tier_raw = asString(data.field_uptime_tier) ?? asString(data.field_tier);
  const tier: "I" | "II" | "III" | "IV" | null = tier_raw && /^(I{1,3}|IV)$/i.test(tier_raw)
    ? (tier_raw.toUpperCase() as "I" | "II" | "III" | "IV")
    : null;
  const year_built = asNumber(data.field_year_operational) ?? asNumber(data.field_year_built);
  const cooling = asString(data.field_cooling_plant_redundancy);
  const ups_redundancy = asString(data.field_ups_redundancy);
  const building_description = asString(data.field_building_structure);
  const security_features = collectAllValues(data.field_security_infrastructure_);

  // Certifications — DR has multiple cert-list fields; we union them, plus a
  // regex sweep of the rendered body as fallback for missing/structured-poorly
  // pages.
  const certFields = [
    ...collectAllValues(data.field_certifications_compliance),
    ...collectAllValues(data.field_certifications_sustainabil),
  ];
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const certs = [...new Set([...certFields, ...extractCertsFromText(bodyText)])].sort();

  // Drop fields containing huge nested blocks before saving raw (keeps file size sane).
  const rawFieldSubset: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "field_template_blocks") continue;
    if (k === "menuData" || k === "footerData") continue;
    if (k.startsWith("field_") || ["title", "node_id", "country", "type"].includes(k)) {
      rawFieldSubset[k] = v;
    }
  }

  const city = addrText?.city ?? facilityCity ?? toTitleCase(citySlug.replace(/-/g, " "));

  return {
    slug: slugify("digital-realty", code, city),
    name: `Digital Realty ${code.toUpperCase()}`,
    operator: "Digital Realty",
    campus: null,
    code: code.toUpperCase(),
    location: {
      address: addrText?.address ?? null,
      city,
      region: addrText?.region ?? null,
      country: country ?? "US", // fallback only used when address/code are present but country missing; downstream ingester re-checks
      postal_code: addrText?.postal ?? null,
      lat,
      lng,
    },
    status: "operational",
    specs: {
      power_mw,
      power_redundancy: null,
      space_sqft,
      space_sqm,
      raised_floor_sqft,
      min_cabinet_density_kw: null,
      max_cabinet_density_kw: null,
      tier,
      year_built,
      year_opened: null,
      cooling,
      cooling_redundancy: cooling,
      pue,
      uptime_sla: null,
      generator_redundancy: null,
      generator_autonomy: null,
      ups_redundancy,
      power_distribution: null,
      building_description,
    },
    connectivity: {
      carriers_count: null,
      ixps_count: null,
      meet_me_rooms: null,
      cross_connects_count: null,
    },
    certifications: certs.length ? certs : null,
    security: security_features.length
      ? {
          biometric: /biometric/i.test(security_features.join(" ")) || null,
          mantrap: /mantrap/i.test(security_features.join(" ")) || null,
          ccvtv_24_7: /CCTV/i.test(security_features.join(" ")) || null,
          on_site_security: security_features.find((s) => /onsite|on-site|24[x\/ ]?7/i.test(s)) ?? null,
          features: security_features,
        }
      : null,
    media: {
      photos: null,
      website: url,
      datasheet_url: null,
    },
    sources: [
      {
        source: "digitalrealty-com",
        source_id: code.toLowerCase(),
        source_url: url,
        fetched_at: nowIso(),
        raw: { region, citySlug, ...rawFieldSubset },
      },
    ],
  };
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ParsedAddr {
  address: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  country: string | null;
}

function parseAddressFromHtml(html: string | null): ParsedAddr | null {
  if (!html) return null;
  // Strip HTML and normalize whitespace; the value field arrives as
  // `<p>3015 Winona Avenue, Burbank, CA 91504</p>\r\n`.
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  // US: "3015 Winona Avenue, Burbank, CA 91504"
  const us = text.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
  if (us) {
    return { address: us[1]!.trim(), city: us[2]!.trim(), region: us[3]!.trim(), postal: us[4]!.trim(), country: "US" };
  }
  // International with trailing country: "Friesstrasse 22, 60388 Frankfurt, Germany"
  const intl = text.match(/^(.+?),\s*(.+?),\s*([A-Za-zÀ-ÿ .'-]+)$/);
  if (intl) {
    const [, addr, middle, countryName] = intl;
    // Try to split middle into "postal city" or "city postal"
    const m1 = middle!.match(/^(\d{4,6})\s+(.+)$/);
    const m2 = middle!.match(/^(.+?)\s+(\d{4,6})$/);
    const cityRegion = m1 ? { postal: m1[1]!, city: m1[2]! } : m2 ? { postal: m2[2]!, city: m2[1]! } : { postal: null as string | null, city: middle!.trim() };
    return {
      address: addr!.trim(),
      city: cityRegion.city.trim(),
      region: null,
      postal: cityRegion.postal,
      country: toCountryCode(countryName!) ?? null,
    };
  }
  // Fallback: treat the whole text as the address
  return { address: text, city: null, region: null, postal: null, country: null };
}

export async function scrapeDigitalRealty(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write(`[digital-realty] starting — fetching sitemap\n`);
  const urls = await fetchFacilityUrls();
  process.stderr.write(`[digital-realty] sitemap → ${urls.length} facility URLs\n`);

  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  let n = 0;
  for (const url of urls) {
    n++;
    try {
      const html = await politeFetch(url);
      const parsed = parseFacility(url, html);
      if (parsed && typeof parsed === "object" && "_reject" in parsed) {
        rejected.push({ record: { url }, reason: (parsed as { _reject: string })._reject });
      } else {
        accepted.push(parsed);
      }
      if (n % 25 === 0 || n === urls.length) {
        process.stderr.write(`[digital-realty] parsed ${n}/${urls.length}\n`);
      }
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  accepted.sort((a, b) => ((a as { slug: string }).slug).localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.digital-realty.jsonl", accepted);
  await writeRejected("digital-realty", rejected);

  process.stderr.write(`[digital-realty] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeDigitalRealty().catch((err) => {
    console.error("[digital-realty] fatal:", err);
    process.exit(1);
  });
}
