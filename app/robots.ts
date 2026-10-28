import type { MetadataRoute } from "next";
import { canonicalOrigin } from "@/lib/census";
import {
  INDEXABLE_CAPS,
  IXP_MIN_FACILITIES,
  NETWORK_MIN_FACILITIES,
} from "@/lib/indexable";
import { loadIxpIndex } from "@/lib/ixps-data";
import { loadTopNetworksIndex } from "@/lib/networks-data";

export const revalidate = 86400;

const SITE = canonicalOrigin();

// Public dataset endpoints — we *want* these surfaced to crawlers (esp.
// answer engines) so they can quote live numbers. Other /api/ routes stay
// off-limits to avoid accidental indexing of internal handlers.
const PUBLIC_API = ["/api/v1/", "/facilities.geojson", "/cloud-regions.geojson"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [networks, ixps] = await Promise.all([
    loadTopNetworksIndex(INDEXABLE_CAPS.networks),
    loadIxpIndex(),
  ]);

  // Longest-match wins. Disallow `/networks/` / `/ixps/` so Google stops
  // walking the 34k/1k long-tail, then Allow the exact sitemap head so those
  // URLs stay crawlable. `$` keeps the index URLs from acting as prefixes.
  const allowedNetworks = networks.top
    .filter((n) => n.facility_count >= NETWORK_MIN_FACILITIES)
    .map((n) => `/networks/${n.asn}`);
  const allowedIxps = ixps
    .filter((i) => i.facility_count >= IXP_MIN_FACILITIES)
    .slice(0, INDEXABLE_CAPS.ixps)
    .map((i) => `/ixps/${i.slug}`);

  const baseRule = {
    allow: ["/", "/networks$", "/ixps$", ...PUBLIC_API, ...allowedNetworks, ...allowedIxps],
    disallow: ["/api/", "/dashboard", "/login", "/networks/", "/ixps/", "/*?*"],
  };

  return {
    rules: [
      { userAgent: "*", ...baseRule },
      { userAgent: "OAI-SearchBot", ...baseRule },
      { userAgent: "ChatGPT-User", ...baseRule },
      { userAgent: "Claude-SearchBot", ...baseRule },
      { userAgent: "Claude-User", ...baseRule },
      { userAgent: "Claude-Web", ...baseRule },
      { userAgent: "PerplexityBot", ...baseRule },
      { userAgent: "Perplexity-User", ...baseRule },
      { userAgent: "GPTBot", disallow: ["/"] },
      { userAgent: "ClaudeBot", disallow: ["/"] },
      { userAgent: "anthropic-ai", disallow: ["/"] },
      { userAgent: "Google-Extended", disallow: ["/"] },
      { userAgent: "Applebot-Extended", disallow: ["/"] },
      { userAgent: "Bytespider", disallow: ["/"] },
      { userAgent: "Meta-ExternalAgent", disallow: ["/"] },
      { userAgent: "Amazonbot", disallow: ["/"] },
      { userAgent: "CCBot", disallow: ["/"] },
      { userAgent: "AhrefsBot", disallow: ["/"] },
      { userAgent: "AhrefsSiteAudit", disallow: ["/"] },
      { userAgent: "SemrushBot", disallow: ["/"] },
      { userAgent: "DotBot", disallow: ["/"] },
      { userAgent: "MJ12bot", disallow: ["/"] },
      { userAgent: "BLEXBot", disallow: ["/"] },
      { userAgent: "DataForSeoBot", disallow: ["/"] },
      { userAgent: "PetalBot", disallow: ["/"] },
      { userAgent: "SeekportBot", disallow: ["/"] },
      { userAgent: "ImagesiftBot", disallow: ["/"] },
      { userAgent: "Scrapy", disallow: ["/"] },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
