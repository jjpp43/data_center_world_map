import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const CAMPUS_SITEMAP = "https://www.stackinfra.com/campuses-sitemap.xml";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};
const DELAY_MS = 2500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CAMPUS_URL_RE =
  /^https:\/\/www\.stackinfra\.com\/locations\/(americas|emea|asia-pacific)\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/i;

const METRO_GEO: Record<string, { country: string; region: string | null }> = {
  atlanta: { country: "US", region: "GA" },
  calgary: { country: "CA", region: "AB" },
  chicago: { country: "US", region: "IL" },
  "dallas-fort-worth": { country: "US", region: "TX" },
  "new-albany": { country: "US", region: "OH" },
  "northern-virginia": { country: "US", region: "VA" },
  phoenix: { country: "US", region: "AZ" },
  portland: { country: "US", region: "OR" },
  "silicon-valley": { country: "US", region: "CA" },
  toronto: { country: "CA", region: "ON" },
  "johor-bahru": { country: "MY", region: null },
  melbourne: { country: "AU", region: "VIC" },
  osaka: { country: "JP", region: null },
  sydney: { country: "AU", region: "NSW" },
  tokyo: { country: "JP", region: null },
  copenhagen: { country: "DK", region: null },
  frankfurt: { country: "DE", region: null },
  geneva: { country: "CH", region: null },
  milan: { country: "IT", region: null },
  oslo: { country: "NO", region: null },
  stockholm: { country: "SE", region: null },
  zurich: { country: "CH", region: null },
};

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function politeFetch(url: string): Promise<string> {
  const res = await cachedFetch(url, {
    cacheNamespace: "stack",
    cacheKey: cacheKeyFor(url),
    headers: BROWSER_HEADERS,
  });
  if (!res.fromCache) await sleep(DELAY_MS);
  return res.body;
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseNum(raw: string): number | null {
  const m = raw.replace(/,/g, "").match(/([\d.]+)/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function codeFromSlug(slug: string): string | null {
  if (/^[a-z]{2,5}\d{2}[a-z]?$/i.test(slug)) return slug.toUpperCase();
  return null;
}

interface Building {
  code: string;
  power_mw: number | null;
  space_sqft: number | null;
}

function parseBuildings($: ReturnType<typeof load>): Building[] {
  const out: Building[] = [];
  $(".title-campus").each((_, el) => {
    const code = decode($(el).text()).replace(/\s+/g, "");
    if (!/^[A-Z]{2,6}\d{2}[A-Z0-9\/-]*$/i.test(code)) return;
    const block = $(el).closest(".content-right-campus, .data-center-content-block");
    const text = decode(block.text());
    const sqftM = text.match(/([\d,]+)\s*SQ\s*FT/i);
    const mwM = text.match(/([\d.]+)\s*MW\b/i);
    const power_mw = mwM?.[1] ? Number(mwM[1]) : null;
    out.push({
      code,
      power_mw: Number.isFinite(power_mw) && power_mw! >= 0.5 ? power_mw : null,
      space_sqft: sqftM?.[1] ? parseNum(sqftM[1]) : null,
    });
  });
  const seen = new Set<string>();
  return out.filter((b) => {
    if (seen.has(b.code)) return false;
    seen.add(b.code);
    return true;
  });
}

function campusMw($: ReturnType<typeof load>): number | null {
  let first: number | null = null;
  $("div, span, p, h2, h3, li").each((_, el) => {
    if (first != null) return;
    const own = decode($(el).clone().children().remove().end().text()).replace(/\s+/g, "");
    const m = own.match(/^(\d+(?:\.\d+)?)MW$/i);
    if (!m?.[1]) return;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0.5) first = n;
  });
  if (first != null) return first;
  const banner = decode($("h1").first().parent().text());
  if (/substation/i.test(banner)) return null;
  const m = banner.match(/(\d+(?:\.\d+)?)\s*MW\b/i);
  return m?.[1] ? Number(m[1]) : null;
}

function campusAcres($: ReturnType<typeof load>): number | null {
  const t = decode($("body").text());
  const m = t.match(/([\d.]+)\s*ACRES?\b/i);
  return m?.[1] ? Number(m[1]) : null;
}

export async function scrapeStack(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write("[stack] starting — campuses sitemap\n");
  const xml = await politeFetch(CAMPUS_SITEMAP);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u): u is string => !!u && CAMPUS_URL_RE.test(u));
  const unique = [...new Set(urls)].sort();
  process.stderr.write(`[stack] sitemap → ${unique.length} campuses\n`);

  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];
  let n = 0;

  for (const url of unique) {
    n++;
    const m = url.match(CAMPUS_URL_RE);
    if (!m?.[2] || !m[3]) {
      rejected.push({ record: { url }, reason: "url does not match" });
      continue;
    }
    const metro = m[2].toLowerCase();
    const slug = m[3].toLowerCase();
    const geo = METRO_GEO[metro];
    if (!geo) {
      rejected.push({ record: { url }, reason: `unknown metro ${metro}` });
      continue;
    }

    try {
      const html = await politeFetch(url);
      const $ = load(html);
      const h1 = decode($("h1").first().text());
      const city = h1.split(/[–—-]/).slice(1).join("–").trim() || metro.replace(/-/g, " ");
      const buildings = parseBuildings($);
      const acres = campusAcres($);
      const campusCode = codeFromSlug(slug);

      const emit = (
        code: string,
        power_mw: number | null,
        space_sqft: number | null,
        site_acres: number | null,
      ) => {
        if (power_mw == null) {
          rejected.push({ record: { url, code }, reason: "no published MW" });
          return;
        }
        accepted.push({
          slug: slugify("stack", code, city),
          name: `STACK ${code}`,
          operator: geo.country === "CH" ? "STACK infrastructure Switzerland S.A." : "STACK Infrastructure",
          campus: campusCode,
          code,
          location: {
            address: null,
            city,
            region: geo.region,
            country: geo.country,
            postal_code: null,
            lat: null,
            lng: null,
          },
          status: "operational",
          specs: {
            power_mw,
            space_sqft: space_sqft != null ? Math.round(space_sqft) : null,
            space_sqm: space_sqft != null ? Math.round(space_sqft / 10.7639) : null,
            tier: null,
            year_built: null,
            cooling: null,
            pue: null,
            site_acres,
          },
          sources: [
            {
              source: "stackinfra-com",
              source_id: code.toLowerCase().replace(/\//g, "-"),
              source_url: url.replace(/\/$/, "/"),
              fetched_at: nowIso(),
              raw: { url, h1, metro, slug, code, power_mw, space_sqft, site_acres },
            },
          ],
        });
      };

      if (buildings.length > 0) {
        for (const b of buildings) emit(b.code, b.power_mw, b.space_sqft, null);
      } else if (campusCode) {
        emit(campusCode, campusMw($), null, acres);
      } else {
        rejected.push({ record: { url, h1 }, reason: "no building codes and no campus code" });
      }

      if (n % 8 === 0 || n === unique.length) {
        process.stderr.write(`[stack] parsed ${n}/${unique.length} (accepted ${accepted.length})\n`);
      }
    } catch (e) {
      rejected.push({ record: { url }, reason: `fetch/parse error: ${(e as Error).message}` });
    }
  }

  accepted.sort((a, b) => (a as { slug: string }).slug.localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.stack.jsonl", accepted);
  await writeRejected("stack", rejected);
  process.stderr.write(`[stack] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeStack().catch((err) => {
    console.error("[stack] fatal:", err);
    process.exit(1);
  });
}
