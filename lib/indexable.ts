import { loadTopFacilitySlugs } from "./facilities-data";
import { loadOperatorSummaries } from "./operators";
import { loadIxpSummaries } from "./ixps-data";
import { loadNetworkSummaries } from "./networks-data";

/**
 * Crawl-budget caps. Must match `app/sitemap.ts` exactly — anything outside
 * these is `noindex,follow` so bots stop walking 15k+ low-value URLs and
 * burning ISR writes for pages that can't rank anyway. Pages still render
 * on demand for direct hits.
 */
export const INDEXABLE_CAPS = {
  facilities: 500,
  operators: 200,
  ixps: 100,
  networks: 100,
} as const;

export const OPERATOR_MIN_FACILITIES = 2;
export const IXP_MIN_FACILITIES = 1;
export const NETWORK_MIN_FACILITIES = 2;

export async function isIndexableFacility(slug: string): Promise<boolean> {
  const top = await loadTopFacilitySlugs(INDEXABLE_CAPS.facilities);
  return top.includes(slug);
}

export async function isIndexableOperator(slug: string): Promise<boolean> {
  const all = await loadOperatorSummaries();
  const top = all
    .filter((o) => o.facility_count >= OPERATOR_MIN_FACILITIES && o.slug.length > 0)
    .slice(0, INDEXABLE_CAPS.operators);
  return top.some((o) => o.slug === slug);
}

export async function isIndexableIxp(slug: string): Promise<boolean> {
  const all = await loadIxpSummaries();
  const top = all
    .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.ixps);
  return top.some((i) => i.slug === slug);
}

export async function isIndexableNetwork(asn: number): Promise<boolean> {
  const all = await loadNetworkSummaries();
  const top = all
    .filter((n) => n.facility_count >= NETWORK_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.networks);
  return top.some((n) => n.asn === asn);
}

/**
 * Metadata robots block applied to non-indexable pages. `follow: true` lets
 * PageRank flow through internal links to the head pages we DO want indexed;
 * `index: false` keeps the URL out of Google.
 */
export const NOINDEX_ROBOTS = {
  index: false,
  follow: true,
} as const;
