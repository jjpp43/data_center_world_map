import { cachedFetch } from "./common/http.ts";
import { load } from "cheerio";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const ORIGIN = "https://www.nextdc.com";
const INDEX = `${ORIGIN}/data-centres`;
const COLO_PAGES = [
  `${ORIGIN}/data-centres/sydney-data-centres-colocation`,
  `${ORIGIN}/data-centres/melbourne-data-centres-colocation`,
  `${ORIGIN}/data-centres/brisbane-data-centres-colocation`,
  `${ORIGIN}/data-centres/perth-data-centres-colocation`,
  `${ORIGIN}/data-centres/adelaide-data-centres-colocation`,
  `${ORIGIN}/data-centres/canberra-data-centres-colocation`,
  `${ORIGIN}/data-centres/darwin-data-centres-colocation`,
  `${ORIGIN}/data-centres/sunshine-coast-data-centres-colocation`,
  `${ORIGIN}/data-centres/port-hedland-data-centre-colocation`,
  `${ORIGIN}/data-centres/newman-data-centre-colocation`,
  `${ORIGIN}/data-centres/malaysia-data-centres-colocation`,
  `${ORIGIN}/data-centres/japan-data-centres-colocation`,
  `${ORIGIN}/data-centres/new-zealand-data-centres-colocation`,
];

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};
const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

async function politeFetch(url: string): Promise<string> {
  const res = await cachedFetch(url, {
    cacheNamespace: "nextdc",
    cacheKey: cacheKeyFor(url),
    headers: BROWSER_HEADERS,
  });
  if (!res.fromCache) await sleep(DELAY_MS);
  return res.body;
}

function parseJsonLd(html: string): unknown[] {
  const $ = load(html);
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let raw = ($(el).text() || $(el).html() || "").trim();
    raw = raw.replace(/^<script[^>]*>/i, "").replace(/<\/script>\s*$/i, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return;
    try {
      out.push(JSON.parse(raw.slice(start, end + 1)));
    } catch {
      /* HubSpot sometimes wraps comments; skip unparseable blocks */
    }
  });
  return out;
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const v of Object.values(obj)) walk(v, visit);
}

function codeFromName(name: string): string | null {
  const m = name.trim().match(/^([A-Z]{1,3}\d+)\b/);
  return m?.[1] ?? null;
}

function parseMw(raw: string | null | undefined): number | null {
  if (!raw) return null;
  if (/tbd/i.test(raw)) return null;
  const m = raw.replace(/,/g, "").match(/([\d.]+)\s*\+?\s*(?:MW)?/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0.5 ? n : null;
}

function parseSqm(raw: string | null | undefined): number | null {
  if (!raw || /tbd/i.test(raw)) return null;
  const m = raw.replace(/,/g, "").match(/([\d.]+)/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function propMap(item: Record<string, unknown>): Record<string, string> {
  const props = item.additionalProperty;
  const out: Record<string, string> = {};
  if (!Array.isArray(props)) return out;
  for (const p of props) {
    if (!p || typeof p !== "object") continue;
    const rec = p as { name?: unknown; value?: unknown };
    if (typeof rec.name === "string" && rec.value != null) out[rec.name.toLowerCase()] = String(rec.value);
  }
  return out;
}

function pickProp(props: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = props[k];
    if (v) return v;
  }
  for (const [k, v] of Object.entries(props)) {
    if (keys.some((want) => k.includes(want))) return v;
  }
  return null;
}

interface Place {
  code: string;
  label: string;
  url: string;
  power_mw: number | null;
  space_sqm: number | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  country: string;
  status: "operational" | "planned" | "under_construction" | null;
}

function placesFromLd(docs: unknown[], pageUrl: string): Place[] {
  const out: Place[] = [];
  walk(docs, (obj) => {
    const types = obj["@type"];
    const typeList = Array.isArray(types) ? types : [types];
    if (!typeList.includes("Place")) return;
    const name = typeof obj.name === "string" ? obj.name : null;
    if (!name) return;
    const code = codeFromName(name);
    if (!code) return;
    const props = propMap(obj);
    const mw = parseMw(pickProp(props, ["target it capacity (mw)", "capacity", "it capacity"]));
    const sqm = parseSqm(pickProp(props, ["technical space (m2)", "white space", "technical space"]));
    const addr = obj.address && typeof obj.address === "object" ? (obj.address as Record<string, unknown>) : null;
    const country =
      toCountryCode(typeof addr?.addressCountry === "string" ? addr.addressCountry : null) ??
      (pageUrl.includes("malaysia") ? "MY" : pageUrl.includes("japan") ? "JP" : pageUrl.includes("zealand") ? "NZ" : "AU");
    const url = typeof obj.url === "string" ? obj.url : pageUrl;
    const locality = typeof addr?.addressLocality === "string" ? addr.addressLocality : null;
    out.push({
      code,
      label: name,
      url,
      power_mw: mw,
      space_sqm: sqm,
      address: typeof addr?.streetAddress === "string" ? addr.streetAddress : null,
      city: locality && !/data centre/i.test(locality) ? locality : null,
      region: typeof addr?.addressRegion === "string" ? addr.addressRegion : null,
      postal: typeof addr?.postalCode === "string" ? addr.postalCode : null,
      country,
      status: null,
    });
  });
  return out;
}

function statusFromRow(text: string): "operational" | "planned" | "under_construction" | null {
  if (/under evaluation/i.test(text)) return null;
  if (/under construction/i.test(text)) return "under_construction";
  if (/planning/i.test(text)) return "planned";
  if (/operational/i.test(text)) return "operational";
  return "operational";
}

function countryForCode(code: string): string {
  if (code.startsWith("KL")) return "MY";
  if (code.startsWith("TK")) return "JP";
  if (code.startsWith("AK")) return "NZ";
  return "AU";
}

function listingsFromIndex(html: string): Place[] {
  const $ = load(html);
  const byCode = new Map<string, Place>();
  $(".dc-row").each((_, el) => {
    const $row = $(el);
    const href = $row.find("a[href]").first().attr("href");
    const code = $row.find("a").first().text().replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{1,3}\d+$/.test(code)) return;
    const text = $row.text().replace(/\s+/g, " ").trim();
    const mwM = text.match(/([\d.]+)\s*\+?\s*MW\b/i);
    const sqmM = text.match(/([\d,]+)\s*m²/i);
    const cityM = text.match(new RegExp(`^${code}\\s+([^|]+)\\|`));
    const city = cityM?.[1]?.replace(/,?\s*CBD\s*$/i, "").trim() || null;
    const url = href ? new URL(href, ORIGIN).toString() : INDEX;
    const prev = byCode.get(code);
    byCode.set(code, {
      code,
      label: `${code} ${city ?? ""}`.trim(),
      url: href ? url : (prev?.url ?? url),
      power_mw: parseMw(mwM?.[1] ?? null) ?? prev?.power_mw ?? null,
      space_sqm: parseSqm(sqmM?.[1] ?? null) ?? prev?.space_sqm ?? null,
      address: prev?.address ?? null,
      city: city ?? prev?.city ?? null,
      region: prev?.region ?? null,
      postal: prev?.postal ?? null,
      country: countryForCode(code),
      status: statusFromRow(text),
    });
  });
  return [...byCode.values()];
}

export async function scrapeNextdc(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write("[nextdc] starting\n");
  const byCode = new Map<string, Place>();

  const indexHtml = await politeFetch(INDEX);
  for (const p of listingsFromIndex(indexHtml)) {
    byCode.set(p.code, p);
  }
  process.stderr.write(`[nextdc] index dc-row → ${byCode.size} codes\n`);

  let n = 0;
  for (const url of COLO_PAGES) {
    n++;
    try {
      const html = await politeFetch(url);
      for (const p of placesFromLd(parseJsonLd(html), url)) {
        const prev = byCode.get(p.code);
        if (!prev) {
          byCode.set(p.code, { ...p, status: p.status ?? "operational" });
          continue;
        }
        byCode.set(p.code, {
          ...prev,
          address: p.address ?? prev.address,
          city: prev.city ?? p.city,
          region: p.region ?? prev.region,
          postal: p.postal ?? prev.postal,
          country: p.country || prev.country,
          url: prev.url.includes(prev.code.toLowerCase()) ? prev.url : p.url,
        });
      }
      process.stderr.write(`[nextdc] colo ${n}/${COLO_PAGES.length} → ${byCode.size} codes\n`);
    } catch (e) {
      process.stderr.write(`[nextdc] colo fail ${url}: ${(e as Error).message}\n`);
    }
  }

  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];

  for (const p of [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))) {
    const status = p.status;
    if (status == null) {
      rejected.push({ record: { code: p.code, url: p.url }, reason: "under evaluation / no status" });
      continue;
    }
    if (p.power_mw == null) {
      rejected.push({ record: { code: p.code, url: p.url }, reason: "no published MW" });
      continue;
    }
    const city = p.city ?? (p.code === "KL1" ? "Kuala Lumpur" : null);
    const space_sqm = p.space_sqm != null ? Math.round(p.space_sqm) : null;
    accepted.push({
      slug: slugify("nextdc", p.code, city),
      name: `NEXTDC ${p.code}`,
      operator: p.country === "MY" ? "NEXTDC Sdn Bhd" : "NEXTDC",
      campus: null,
      code: p.code,
      location: {
        address: p.address,
        city,
        region: p.region,
        country: p.country,
        postal_code: p.postal,
        lat: null,
        lng: null,
      },
      status,
      specs: {
        power_mw: p.power_mw,
        space_sqft: space_sqm != null ? Math.round(space_sqm * 10.7639) : null,
        space_sqm,
        tier: null,
        year_built: null,
        cooling: null,
        pue: null,
      },
      sources: [
        {
          source: "nextdc-com",
          source_id: p.code.toLowerCase(),
          source_url: p.url,
          fetched_at: nowIso(),
          raw: p,
        },
      ],
    });
  }

  accepted.sort((a, b) => (a as { slug: string }).slug.localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.nextdc.jsonl", accepted);
  await writeRejected("nextdc", rejected);
  process.stderr.write(`[nextdc] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeNextdc().catch((err) => {
    console.error("[nextdc] fatal:", err);
    process.exit(1);
  });
}
