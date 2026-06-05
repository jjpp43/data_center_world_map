import { cachedFetch } from "./common/http.ts";
import { Facility } from "./common/schema.ts";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, round6, validateAll, writeJsonl, writeRejected } from "./common/writer.ts";

const ENDPOINT = "https://overpass-api.de/api/interpreter";

const QUERY = `[out:json][timeout:90];
(
  node["telecom"="data_center"];
  way["telecom"="data_center"];
  relation["telecom"="data_center"];
);
out center tags;`;

type OsmElementType = "node" | "way" | "relation";

interface OsmElement {
  type: OsmElementType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OsmElement[];
}

function joinAddress(street: string | undefined, houseno: string | undefined): string | null {
  const parts = [houseno, street].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function pickCoord(el: OsmElement): { lat: number; lng: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function parseYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})/);
  if (!m || !m[1]) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return y;
}

function mapElement(el: OsmElement, fetchedAt: string): unknown | null {
  const tags = el.tags ?? {};
  const name = (tags["name"] ?? "").trim();
  if (!name) return null;
  const coord = pickCoord(el);
  if (!coord) return null;

  const operator = (tags["operator"] ?? "").trim() || null;
  const city = (tags["addr:city"] ?? "").trim() || null;
  const country = toCountryCode(tags["addr:country"] ?? null);
  if (!country) return null;

  const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

  return {
    slug: slugify(operator ?? "", name, city ?? "") || slugify(name) || `osm-${el.type}-${el.id}`,
    name,
    operator,
    campus: null,
    location: {
      address: joinAddress(tags["addr:street"], tags["addr:housenumber"]),
      city,
      region: (tags["addr:state"] ?? tags["addr:region"] ?? "").trim() || null,
      country,
      postal_code: (tags["addr:postcode"] ?? "").trim() || null,
      lat: round6(coord.lat),
      lng: round6(coord.lng),
    },
    status: "operational",
    specs: {
      power_mw: null,
      space_sqft: null,
      space_sqm: null,
      tier: null,
      year_built: parseYear(tags["start_date"]),
      cooling: null,
      pue: null,
    },
    connectivity: {
      carriers: null,
      ixps: null,
      cross_connects: null,
    },
    certifications: null,
    media: {
      photos: null,
      website: (tags["website"] ?? tags["contact:website"] ?? "").trim() || null,
    },
    footprint: null,
    sources: [
      {
        source: "osm",
        source_id: `${el.type}/${el.id}`,
        source_url: sourceUrl,
        fetched_at: fetchedAt,
        raw: el,
      },
    ],
  };
}

export async function scrapeOsm(): Promise<{ accepted: number; rejected: number }> {
  const fetchedAt = nowIso();
  process.stderr.write(`[osm] querying Overpass — this may take a minute\n`);

  const res = await cachedFetch(ENDPOINT, {
    cacheNamespace: "osm",
    cacheKey: "telecom-data_center",
    method: "POST",
    body: `data=${encodeURIComponent(QUERY)}`,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "*/*",
      "accept-encoding": "identity",
    },
    maxRetries: 2,
    backoffMs: [5_000, 15_000],
  });

  const parsed = JSON.parse(res.body) as OverpassResponse;
  const elements = parsed.elements ?? [];
  process.stderr.write(`[osm] received ${elements.length} elements\n`);

  const mapped: unknown[] = [];
  for (const el of elements) {
    const rec = mapElement(el, fetchedAt);
    if (rec) mapped.push(rec);
  }

  const { accepted, rejected } = validateAll(mapped, Facility);
  await writeJsonl("facilities.osm.jsonl", accepted);
  await writeRejected("osm", rejected);

  process.stderr.write(`[osm] done — accepted=${accepted.length} rejected=${rejected.length}\n`);
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapeOsm().catch((err) => {
    console.error("[osm] fatal:", err);
    process.exit(1);
  });
}
