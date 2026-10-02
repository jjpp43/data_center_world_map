import type { MetadataRoute } from "next";
import { canonicalOrigin } from "@/lib/census";

const SITE = canonicalOrigin();

// Public dataset endpoints — we *want* these surfaced to crawlers (esp.
// answer engines) so they can quote live numbers. Other /api/ routes stay
// off-limits to avoid accidental indexing of internal handlers.
const PUBLIC_API = ["/api/v1/", "/facilities.geojson", "/cloud-regions.geojson"];

export default function robots(): MetadataRoute.Robots {
  const baseRule = {
    allow: ["/", ...PUBLIC_API],
    disallow: ["/api/"],
  };

  return {
    rules: [
      { userAgent: "*", ...baseRule },
      // Explicitly welcome major answer-engine and AI training crawlers. By
      // default `*` covers them, but naming them signals intent and unlocks
      // crawlers (Google-Extended, ClaudeBot) that respect explicit allows.
      { userAgent: "GPTBot", ...baseRule },
      { userAgent: "OAI-SearchBot", ...baseRule },
      { userAgent: "ChatGPT-User", ...baseRule },
      { userAgent: "ClaudeBot", ...baseRule },
      { userAgent: "Claude-Web", ...baseRule },
      { userAgent: "PerplexityBot", ...baseRule },
      { userAgent: "Perplexity-User", ...baseRule },
      { userAgent: "Google-Extended", ...baseRule },
      { userAgent: "Applebot-Extended", ...baseRule },
      // Blocked, not welcomed. These walk the full sitemap (thousands of unique
      // slugs/day). Each PoP miss is a billed ISR read; none of them are a
      // search or answer surface we can be cited in. Google/Bing stay on `*`.
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
