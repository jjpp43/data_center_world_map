import { cachedFetch } from "./common/http.ts";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, writeJsonl, writeRejected } from "./common/writer.ts";

const LIST_URL = "https://aligneddc.com/wp-json/wp/v2/map_locations?per_page=100";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  "user-agent": BROWSER_UA,
  accept: "application/json, text/html;q=0.9, */*;q=0.5",
  "accept-language": "en-US,en;q=0.9",
};

interface WpLocation {
  slug: string;
  link: string;
  title?: { rendered?: string };
  meta?: {
    address?: string;
    coordinates?: string;
  };
}

function cacheKeyFor(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\//g, "_").slice(0, 180);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseCoords(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function guessCountry(address: string): string | null {
  if (/\bUSA\b|\bUnited States\b|\([A-Z]{2}\)\s*\d{5}/i.test(address)) return "US";
  if (/\bBrazil\b|\bBrasil\b| - SP\b| - RJ\b/i.test(address)) return "BR";
  if (/\bMexico\b|\bMéxico\b|\bGto\.|\bQro\./i.test(address)) return "MX";
  if (/\bChile\b/i.test(address)) return "CL";
  if (/\bColombia\b|\bCundinamarca\b/i.test(address)) return "CO";
  const us = address.match(/\b(Georgia|Ohio|Texas|Virginia|Maryland|Illinois|Oregon|Arizona|Utah)\b/i);
  if (us) return "US";
  return null;
}

function parseUsParts(address: string): { city: string | null; region: string | null; postal: string | null } {
  const m = address.match(
    /,\s*([^,]+),\s*(?:([A-Za-z .]+)\s*)?\(([A-Z]{2})\)\s*(\d{5}(?:-\d{4})?)?(?:,\s*USA)?$/i,
  );
  if (m?.[1] && m[3] && !/\([A-Z]{2}\)/.test(m[1])) {
    return { city: m[1].trim(), region: m[3].toUpperCase(), postal: m[4] ?? null };
  }
  const simple = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (simple?.[1] && simple[2]) {
    return { city: simple[1].trim(), region: simple[2], postal: simple[3] ?? null };
  }
  const glued = address.match(
    /^(.+?)\s+([A-Z][A-Za-z.'-]+),\s*[A-Za-z .]+\(([A-Z]{2})\)\s*(\d{5}(?:-\d{4})?)/,
  );
  if (glued?.[2] && glued[3]) {
    return { city: glued[2], region: glued[3].toUpperCase(), postal: glued[4] ?? null };
  }
  return { city: null, region: null, postal: null };
}

function parseCode(title: string, slug: string): string | null {
  const spaced = title.match(/\b([A-Z]{2,5})[ -](\d{2})(?:\/\d{2})*\b/);
  if (spaced?.[1] && spaced[2]) return `${spaced[1]}-${spaced[2]}`;
  const odata = title.match(/\bDC\s+([A-Z]{2}\d{2})\b/i);
  if (odata?.[1]) return odata[1].toUpperCase();
  const fromSlug = slug.match(/^([a-z]{2,5}-\d{2})/i);
  if (fromSlug?.[1]) return fromSlug[1].toUpperCase();
  return null;
}

function streetFromAddress(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[0] ?? null;
}

function cityFallback(address: string, parts: { city: string | null }): string | null {
  if (parts.city) return parts.city;
  const bits = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (bits.length >= 2) return bits[1] ?? null;
  return null;
}

export async function scrapeAligned(): Promise<{ accepted: number; rejected: number }> {
  process.stderr.write("[aligned] starting — fetching map_locations REST\n");
  const res = await cachedFetch(LIST_URL, {
    cacheNamespace: "aligned",
    cacheKey: cacheKeyFor(LIST_URL),
    headers: BROWSER_HEADERS,
  });
  const rows = JSON.parse(res.body) as WpLocation[];
  if (!Array.isArray(rows)) throw new Error("map_locations REST did not return an array");
  process.stderr.write(`[aligned] REST → ${rows.length} locations\n`);

  const accepted: unknown[] = [];
  const rejected: Array<{ record: unknown; reason: string }> = [];

  for (const row of rows) {
    const title = decodeEntities(row.title?.rendered ?? "");
    const address = (row.meta?.address ?? "").trim();
    const coords = parseCoords(row.meta?.coordinates);
    if (!coords) {
      rejected.push({ record: { slug: row.slug, link: row.link }, reason: "no coordinates" });
      continue;
    }
    if (!address) {
      rejected.push({ record: { slug: row.slug, link: row.link }, reason: "no address" });
      continue;
    }

    const isOdata = /odata/i.test(title) || /odata/i.test(row.slug);
    const code = parseCode(title, row.slug);
    const country = toCountryCode(guessCountry(address)) ?? (isOdata ? null : "US");
    if (!country) {
      rejected.push({ record: { slug: row.slug, title, address }, reason: "unmapped country" });
      continue;
    }
    const us = country === "US" ? parseUsParts(address) : { city: null, region: null, postal: null };
    const city = cityFallback(address, us);
    const operator = isOdata
      ? country === "CO"
        ? "ODATA COLOMBIA SAS"
        : "ODATA S.A."
      : "Aligned Data Centers";
    const name = isOdata
      ? title.replace(/\s+Data Centers?$/i, "").trim()
      : code
        ? `Aligned ${code}`
        : `Aligned ${title.replace(/\s+Data Center$/i, "").trim()}`;

    accepted.push({
      slug: slugify(isOdata ? "odata" : "aligned", row.slug),
      name,
      operator,
      campus: /01\/02\/03/.test(title) ? title.replace(/\s+Data Center$/i, "").trim() : null,
      code,
      location: {
        address: streetFromAddress(address),
        city,
        region: us.region,
        country,
        postal_code: us.postal,
        lat: coords.lat,
        lng: coords.lng,
      },
      status: "operational",
      specs: {
        power_mw: null,
        space_sqft: null,
        space_sqm: null,
        tier: null,
        year_built: null,
        cooling: null,
        pue: null,
      },
      sources: [
        {
          source: "aligneddc-com",
          source_id: row.slug,
          source_url: row.link,
          fetched_at: nowIso(),
          raw: {
            slug: row.slug,
            title,
            address,
            coordinates: row.meta?.coordinates,
            isOdata,
          },
        },
      ],
    });
  }

  accepted.sort((a, b) => (a as { slug: string }).slug.localeCompare((b as { slug: string }).slug));
  await writeJsonl("facilities.aligned.jsonl", accepted);
  await writeRejected("aligned", rejected);
  process.stderr.write(`[aligned] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeAligned().catch((err) => {
    console.error("[aligned] fatal:", err);
    process.exit(1);
  });
}
