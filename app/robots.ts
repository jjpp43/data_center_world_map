import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

// Public dataset endpoints — we *want* these surfaced to crawlers (esp.
// answer engines) so they can quote live numbers. Other /api/ routes stay
// off-limits to avoid accidental indexing of internal handlers.
const PUBLIC_API = ["/api/v1/", "/api/facilities.geojson", "/api/cloud-regions.geojson"];

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
      { userAgent: "Bytespider", ...baseRule },
      { userAgent: "Meta-ExternalAgent", ...baseRule },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
