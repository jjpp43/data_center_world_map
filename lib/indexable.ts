import { supabaseServer } from "./supabase";
import { loadOperatorSummaries } from "./operators";
import { loadIxpSummaries } from "./ixps-data";

/**
 * Sitemap / crawl-budget caps. Must match `app/sitemap.ts` exactly — they
 * bound how many long-tail URLs we advertise in the sitemap so bots don't
 * prioritise walking 15k+ thin pages. Being outside a cap only lowers crawl
 * priority; it does NOT `noindex` the page (the sitemap is a hint, not a
 * gate). Facilities are the exception and are NOT capped here: every real
 * facility page (coords present, see `isFacilityIndexable`) is the primary
 * rankable content, so `app/sitemap.ts` lists the full indexable set.
 */
export const INDEXABLE_CAPS = {
  operators: 200,
  ixps: 100,
  networks: 100,
} as const;

export const OPERATOR_MIN_FACILITIES = 2;
export const IXP_MIN_FACILITIES = 1;
export const NETWORK_MIN_FACILITIES = 2;

// Process-local memoization. `generateMetadata` runs once per per-slug page,
// so a naive call into the per-loader unstable_cache produces N hits where
// N = number of pages. For loadNetworkSummaries() that's catastrophic: the
// full 34k-network blob is ~13MB and exceeds Next's 2MB cache cap, so every
// call re-fetches from Supabase → OOM during build. These promises dedupe
// to a single fetch per build worker (and per function instance at runtime).
let operatorSetPromise: Promise<Set<string>> | null = null;
let ixpSetPromise: Promise<Set<string>> | null = null;
let networkSetPromise: Promise<Set<number>> | null = null;

function getOperatorSet(): Promise<Set<string>> {
  if (!operatorSetPromise) {
    operatorSetPromise = loadOperatorSummaries().then(
      (all) =>
        new Set(
          all
            .filter(
              (o) => o.facility_count >= OPERATOR_MIN_FACILITIES && o.slug.length > 0,
            )
            .slice(0, INDEXABLE_CAPS.operators)
            .map((o) => o.slug),
        ),
    );
  }
  return operatorSetPromise;
}

function getIxpSet(): Promise<Set<string>> {
  if (!ixpSetPromise) {
    ixpSetPromise = loadIxpSummaries().then(
      (all) =>
        new Set(
          all
            .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
            .slice(0, INDEXABLE_CAPS.ixps)
            .map((i) => i.slug),
        ),
    );
  }
  return ixpSetPromise;
}

/**
 * Slim, dedicated query for the network indexable set. Bypasses
 * loadNetworkSummaries() because its 13MB payload can't be cached and would
 * be re-fetched per page. Selects only (asn, count) — ~34k rows × ~50 bytes
 * each = ~1.7MB transient, then collapses to a 100-element Set.
 */
function getNetworkSet(): Promise<Set<number>> {
  if (!networkSetPromise) {
    networkSetPromise = (async () => {
      const sb = supabaseServer();
      type Row = { asn: number; networks_at_facility: { count: number }[] | null };
      const rows: Row[] = [];
      for (let from = 0; from < 100_000; from += 1000) {
        const { data, error } = await sb
          .from("networks")
          .select("asn, networks_at_facility(count)")
          .order("asn")
          .range(from, from + 999)
          .returns<Row[]>();
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const asns = rows
        .map((r) => ({ asn: r.asn, c: r.networks_at_facility?.[0]?.count ?? 0 }))
        .filter((r) => r.c >= NETWORK_MIN_FACILITIES)
        .sort((a, b) => b.c - a.c)
        .slice(0, INDEXABLE_CAPS.networks)
        .map((r) => r.asn);
      return new Set(asns);
    })();
  }
  return networkSetPromise;
}

/**
 * A facility page is indexable when it represents a real, mappable data
 * center — i.e. it has coordinates. This restores the full catalog to the
 * index (the known-good pre-noindex state): every facility page is unique
 * (operator + location + specs + network/IXP lists) and can rank on
 * long-tail queries. Only null-island / stub rows are gated off. Facility
 * pages are NOT throttled by a top-N crawl cap — that would deindex ~91% of
 * the catalog and tank impressions. `app/sitemap.ts` lists the full indexable
 * set (no facilities cap) so every restored page has a re-crawl signal.
 */
export function isFacilityIndexable(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !(lat === 0 && lng === 0)
  );
}

export async function isIndexableOperator(slug: string): Promise<boolean> {
  return (await getOperatorSet()).has(slug);
}

export async function isIndexableIxp(slug: string): Promise<boolean> {
  return (await getIxpSet()).has(slug);
}

export async function isIndexableNetwork(asn: number): Promise<boolean> {
  return (await getNetworkSet()).has(asn);
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
