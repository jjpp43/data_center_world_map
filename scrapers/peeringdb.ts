import { cachedFetch } from "./common/http.ts";
import { Facility } from "./common/schema.ts";
import { slugify } from "./common/slug.ts";
import { toCountryCode } from "./common/countries.ts";
import { nowIso, round6, validateAll, writeJsonl, writeRejected } from "./common/writer.ts";

const API = "https://www.peeringdb.com/api/fac";
const PAGE_SIZE = 250;
// PeeringDB's anonymous rate limit is stricter than its docs suggest — bursts
// of ~20 pages then a hard 429 with ~60s retry-after. We pace at 1500ms per
// page so a full scrape stays under the unauthenticated quota.
const DELAY_MS = 1500;

interface PdbFacility {
  id: number;
  name: string | null;
  org_name?: string | null;
  org_id?: number;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zipcode?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  website?: string | null;
  status?: string | null;
  [k: string]: unknown;
}

interface PdbResponse {
  data: PdbFacility[];
  meta?: { total?: number };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapStatus(raw: string | null | undefined): "operational" | null {
  if (!raw) return null;
  const t = raw.toLowerCase().trim();
  if (t === "ok" || t === "active" || t === "live" || t === "operational") return "operational";
  return null;
}

function joinAddress(a1: string | null | undefined, a2: string | null | undefined): string | null {
  const parts = [a1, a2].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function buildSlug(operator: string | null, name: string, city: string | null): string {
  return slugify(operator ?? "", name, city ?? "") || slugify(name) || `peeringdb-${Date.now()}`;
}

async function fetchPage(skip: number): Promise<PdbResponse> {
  const url = `${API}?limit=${PAGE_SIZE}&skip=${skip}`;
  const res = await cachedFetch(url, {
    cacheNamespace: "peeringdb",
    cacheKey: `fac-skip-${skip}-limit-${PAGE_SIZE}`,
    headers: { accept: "application/json" },
  });
  return JSON.parse(res.body) as PdbResponse;
}

function mapFacility(raw: PdbFacility, fetchedAt: string): unknown {
  const lat = toNum(raw.latitude);
  const lng = toNum(raw.longitude);
  const name = (raw.name ?? "").trim();
  const operator = (raw.org_name ?? "").trim() || null;
  const city = (raw.city ?? "").trim() || null;
  const country = toCountryCode(raw.country ?? null);

  return {
    slug: buildSlug(operator, name, city),
    name,
    operator,
    campus: null,
    location: {
      address: joinAddress(raw.address1, raw.address2),
      city,
      region: (raw.state ?? "").trim() || null,
      country,
      postal_code: (raw.zipcode ?? "").trim() || null,
      lat: lat !== null ? round6(lat) : lat,
      lng: lng !== null ? round6(lng) : lng,
    },
    status: mapStatus(raw.status) ?? "operational",
    specs: {
      power_mw: null,
      space_sqft: null,
      space_sqm: null,
      tier: null,
      year_built: null,
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
      website: (raw.website ?? "").trim() || null,
    },
    footprint: null,
    sources: [
      {
        source: "peeringdb",
        source_id: String(raw.id),
        source_url: `https://www.peeringdb.com/fac/${raw.id}`,
        fetched_at: fetchedAt,
        raw,
      },
    ],
  };
}

export async function scrapePeeringDb(): Promise<{ accepted: number; rejected: number }> {
  const fetchedAt = nowIso();
  const all: unknown[] = [];
  let skip = 0;
  let page = 0;

  process.stderr.write(`[peeringdb] starting fetch from ${API}\n`);

  while (true) {
    const data = await fetchPage(skip);
    const rows = data.data ?? [];
    page += 1;
    process.stderr.write(`[peeringdb] page ${page} (skip=${skip}) — ${rows.length} rows\n`);
    if (rows.length === 0) break;

    for (const row of rows) {
      const lat = toNum(row.latitude);
      const lng = toNum(row.longitude);
      // Skip rows with null/0 coordinates per the brief
      if (lat === null || lng === null || lat === 0 || lng === 0) continue;
      all.push(mapFacility(row, fetchedAt));
    }

    if (rows.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    await sleep(DELAY_MS);
  }

  const { accepted, rejected } = validateAll(all, Facility);
  await writeJsonl("facilities.peeringdb.jsonl", accepted);
  await writeRejected("peeringdb", rejected);

  process.stderr.write(
    `[peeringdb] done — accepted=${accepted.length} rejected=${rejected.length}\n`
  );
  return { accepted: accepted.length, rejected: rejected.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  scrapePeeringDb().catch((err) => {
    console.error("[peeringdb] fatal:", err);
    process.exit(1);
  });
}
