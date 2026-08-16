import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const SITEMAP = "https://h5datacenters.com/sitemap.xml";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};
const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const FACILITY_URL_RE = /^https:\/\/h5datacenters\.com\/([a-z0-9-]+)-data-center\.html$/i;
const SKIP_SLUG = /expansion|about|wholesale|build-to-suit|powered-shell|compliant|solutions|resources|faqs|qualified|experts|press|events|careers|sale|outsourcing|risk|energy-efficient|comparing|announces|acquir|^h5-/i;

const KNOWN_CERTS = [
  "SOC 1", "SOC 2", "SOC 3",
  "ISO 9001", "ISO 14001", "ISO 22301", "ISO 27001",
  "PCI DSS", "PCI-DSS", "HIPAA", "NIST", "FedRAMP", "HITRUST",
];

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function politeFetch(url: string): Promise<string> {
  const res = await cachedFetch(url, {
    cacheNamespace: "h5",
    cacheKey: cacheKeyFor(url),
    headers: BROWSER_HEADERS,
  });
  if (!res.fromCache) await sleep(DELAY_MS);
  return res.body;
}

async function fetchUrls(): Promise<string[]> {
  const xml = await politeFetch(SITEMAP);
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u): u is string => !!u);
  return [...new Set(all.filter((u) => {
    const m = u.match(FACILITY_URL_RE);
    if (!m?.[1]) return false;
    return !SKIP_SLUG.test(m[1]);
  }))].sort();
}

function extractCerts(text: string): string[] {
  const found = new Set<string>();
  for (const c of KNOWN_CERTS) {
    if (new RegExp(`\\b${c.replace(/[-./]/g, ".")}\\b`, "i").test(text)) found.add(c);
  }
  return [...found].sort();
}

function parseGeoPosition(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseUsAddress(raw: string): {
  address: string;
  city: string;
  region: string;
  postal: string | null;
} | null {
  const cleaned = raw.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const comma = cleaned.match(
    /^(.+?),\s*([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
  );
  if (comma?.[1] && comma[2] && comma[3]) {
    return { address: comma[1].trim(), city: comma[2].trim(), region: comma[3], postal: comma[4] ?? null };
  }
  const dash = cleaned.match(
    /^(.+?)\s+[-–]\s+([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
  );
  if (dash?.[1] && dash[2] && dash[3]) {
    return { address: dash[1].trim(), city: dash[2].trim(), region: dash[3], postal: dash[4] ?? null };
  }
  return null;
}

function romanLabel(slug: string): string {
  return slug
    .split("-")
    .map((p) => {
      if (/^(i|ii|iii|iv|v)$/i.test(p)) return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

function parseFacility(url: string, html: string): { record: unknown } | { _reject: string } {
  const $ = load(html);
  const m = url.match(FACILITY_URL_RE);
  const urlSlug = m?.[1];
  if (!urlSlug) return { _reject: `url does not match: ${url}` };

  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const geoPos = parseGeoPosition($('meta[name="geo.position"]').attr("content"));
  const placename = $('meta[name="geo.placename"]').attr("content")?.trim() ?? null;
  const geoRegion = $('meta[name="geo.region"]').attr("content")?.trim() ?? null;
  const cityLabel = romanLabel(urlSlug);
  const cityNeedle = cityLabel.replace(/\s+I{1,3}$/i, "").trim();

  const locLabel = $("p")
    .filter((_, el) => /Location:/i.test($(el).text()))
    .first()
    .text()
    .replace(/\s+/g, " ");
  const locAddr = locLabel.match(/Location:\s*(.+?)(?:\s*\[|$)/i)?.[1]?.trim() ?? placename;
  const parsed = locAddr ? parseUsAddress(locAddr) : null;

  const localText = $("p")
    .filter((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ");
      return t.length > 60 && new RegExp(cityNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t);
    })
    .map((_, el) => $(el).text().replace(/\s+/g, " "))
    .get()
    .slice(0, 6)
    .join(" ");

  const specText = `${h1} ${localText} ${locLabel}`;

  const totalMw =
    specText.match(/(\d+(?:\.\d+)?)\s*megawatts?\s+of\s+total/i) ??
    specText.match(/delivering\s+(\d+(?:\.\d+)?)\s*megawatts?/i) ??
    specText.match(/(\d+(?:\.\d+)?)\s*megawatts?\s+(?:total\s+)?(?:power|capacity)/i) ??
    specText.match(/access to\s+(\d+(?:\.\d+)?)\s*megawatts?/i) ??
    specText.match(/(\d+(?:\.\d+)?)\s*MW\b/);
  const power_mw = totalMw?.[1] ? Number(totalMw[1]) : null;

  const sqftM = specText.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*square[- ](?:foot|feet)/i);
  const space_sqft = sqftM?.[1] ? Number(sqftM[1].replace(/,/g, "")) : null;

  const acresM = specText.match(/([\d.]+)\s*-?\s*acres?\b/i);
  const site_acres = acresM?.[1] ? Number(acresM[1]) : null;

  const tierM = specText.match(/\bTier\s+(IV|III|II|I)\b/i);
  const tier = tierM?.[1]?.toUpperCase() ?? null;

  if (!parsed && !geoPos) return { _reject: "no address or coordinates" };

  const hay = `${h1} ${parsed?.city ?? ""} ${locAddr ?? ""}`.toLowerCase();
  const slugTokens = urlSlug.toLowerCase().split("-").filter((t) => !/^(i|ii|iii|iv)$/.test(t));
  const lastToken = slugTokens[slugTokens.length - 1];
  if (lastToken && !hay.includes(lastToken)) {
    return { _reject: `page city mismatch (url=${urlSlug}, got ${parsed?.city ?? h1})` };
  }

  const name = `H5 Data Centers ${cityLabel}`;
  const city = parsed?.city ?? cityLabel.replace(/\s+I{1,3}$/, "");
  const region = parsed?.region ?? geoRegion?.replace(/^US-/, "") ?? null;
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const certs = extractCerts(specText + " " + bodyText.slice(0, 4000));

  return {
    record: {
      slug: slugify("h5", urlSlug, city),
      name,
      operator: "H5 Data Centers",
      campus: null,
      code: null,
      location: {
        address: parsed?.address ?? locAddr,
        city,
        region,
        country: "US",
        postal_code: parsed?.postal ?? null,
        lat: geoPos?.lat ?? null,
        lng: geoPos?.lng ?? null,
      },
      status: "operational",
      specs: {
        power_mw,
        space_sqft,
        space_sqm: null,
        tier,
        year_built: null,
        cooling: null,
        pue: null,
        site_acres,
        power_redundancy: /2N UPS/i.test(bodyText) ? "2N" : null,
        generator_redundancy: /N\+1 Backup Generators/i.test(bodyText) ? "N+1" : null,
      },
      certifications: certs.length ? certs : null,
      sources: [
        {
          source: "h5datacenters-com",
          source_id: urlSlug.toLowerCase(),
          source_url: url,
          fetched_at: nowIso(),
          raw: {
            url,
            h1,
            urlSlug,
            geoPos,
            placename,
            locAddr,
            power_mw,
            space_sqft,
            tier,
          },
        },
      ],
    },
  };
}

export async function scrapeH5(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write("[h5] starting — fetching sitemap\n");
  const urls = await fetchUrls();
  process.stderr.write(`[h5] sitemap → ${urls.length} URLs\n`);

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
        process.stderr.write(`[h5] parsed ${n}/${urls.length}\n`);
      }
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  accepted.sort((a, b) => (a as { slug: string }).slug.localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.h5.jsonl", accepted);
  await writeRejected("h5", rejected);
  process.stderr.write(`[h5] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeH5().catch((err) => {
    console.error("[h5] fatal:", err);
    process.exit(1);
  });
}
