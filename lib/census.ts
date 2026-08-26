/**
 * Hand-synced public census for AEO/SEO copy, Dataset JSON-LD, and the OG card.
 * Must match `.cursor/rules/project.mdc` → Current status. Bump after ingest
 * when facility / network / IXP / region totals change. `public/llms.txt` is
 * a static file — copy the formatted numbers there in the same pass.
 */
export const CENSUS = {
  facilities: 5829,
  countries: 148,
  networks: 34732,
  ixps: 1309,
  cloudRegions: 176,
} as const;

const fmt = (n: number) => n.toLocaleString("en-US");

export const CENSUS_FMT = {
  facilities: fmt(CENSUS.facilities),
  countries: fmt(CENSUS.countries),
  networks: fmt(CENSUS.networks),
  ixps: fmt(CENSUS.ixps),
  cloudRegions: fmt(CENSUS.cloudRegions),
} as const;

/** Canonical public origin. Apex 308s here; hand-injected JSON-LD must be www. */
export const SITE_ORIGIN = "https://www.datacenters.world";

export function canonicalOrigin(
  raw = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  try {
    const u = new URL(raw || SITE_ORIGIN);
    if (u.hostname === "datacenters.world") u.hostname = "www.datacenters.world";
    return u.origin;
  } catch {
    return SITE_ORIGIN;
  }
}
