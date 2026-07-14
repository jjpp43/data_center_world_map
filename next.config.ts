import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

const SUPABASE_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "*.supabase.co";
  try {
    return new URL(url).host;
  } catch {
    return "*.supabase.co";
  }
})();

const POSTHOG_INGEST_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST = POSTHOG_INGEST_HOST.replace(
  /^https:\/\/([a-z]+)\.i\.posthog\.com$/,
  "https://$1-assets.i.posthog.com",
);

const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://api.mapbox.com",
    "https://events.mapbox.com",
    "https://*.i.posthog.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
  "img-src": ["'self'", "data:", "blob:", "https://api.mapbox.com", "https://*.tiles.mapbox.com"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    `https://${SUPABASE_HOST}`,
    "https://api.mapbox.com",
    "https://events.mapbox.com",
    "https://*.tiles.mapbox.com",
    "https://*.i.posthog.com",
  ],
  "worker-src": ["'self'", "blob:"],
  "child-src": ["'self'", "blob:"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"],
  "manifest-src": ["'self'"],
  "upgrade-insecure-requests": [],
};

const csp = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => (sources.length ? `${directive} ${sources.join(" ")}` : directive))
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// Brand-name aliases for /operators/<slug>. The dataset stores operators with
// their legal-suffix form (e.g. "Equinix, Inc.", "DataBank, Ltd.", "QTS
// Realty Trust, Inc."), but users — including AI crawlers following obvious
// brand-name URLs — will type the short form. Redirect those to the canonical
// flagship slug as a permanent 308 so search engines collapse them.
const OPERATOR_ALIASES: Record<string, string> = {
  equinix: "equinix-inc",
  databank: "databank-ltd",
  cologix: "cologix-inc",
  cyrusone: "cyrusone-inc",
  qts: "qts-realty-trust-inc",
  "iron-mountain": "iron-mountain-data-centers",
  edgeconnex: "edgeconnex-inc",
  flexential: "flexential-corp",
  lumen: "lumen-technologies-inc",
  tierpoint: "tierpoint-llc",
  cogent: "cogent-communications-inc",
  "digital-realty-trust": "digital-realty",
};

// Facility slugs that Google has indexed but that no longer resolve, mapped to
// their current canonical slug. Facility slugs historically baked in the
// (volatile) city token, so a re-scrape that changed/dropped a city could
// strand an already-indexed URL as a 404. This map 308-redirects the dead URL
// to the live page at the routing layer — no function invocation, no Supabase
// read, no ISR write — so ranking equity transfers instead of dying on a 404.
// Populated by `npm run reconcile:404 -- --csv <GSC export>`; hand-auditable.
const FACILITY_SLUG_REDIRECTS: Record<string, string> = (() => {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "data/facility-slug-redirects.json"),
      "utf8",
    );
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
})();

const GEOJSON_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/:asset(facilities.geojson|cloud-regions.geojson)",
        headers: [{ key: "Cache-Control", value: GEOJSON_CACHE }],
      },
    ];
  },
  async redirects() {
    const operatorRedirects = Object.entries(OPERATOR_ALIASES).map(([from, to]) => ({
      source: `/operators/${from}`,
      destination: `/operators/${to}`,
      permanent: true,
    }));
    const facilityRedirects = Object.entries(FACILITY_SLUG_REDIRECTS)
      .filter(([from, to]) => from && to && from !== to)
      .map(([from, to]) => ({
        source: `/facility/${from}`,
        destination: `/facility/${to}`,
        permanent: true,
      }));
    return [...operatorRedirects, ...facilityRedirects];
  },
  // Reverse-proxy PostHog through our own domain so ad-blockers (uBlock,
  // Brave, etc.) that target *.posthog.com don't drop events from dev-heavy
  // visitors. Browser sees /ingest/*; Next forwards server-side.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${POSTHOG_ASSETS_HOST}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${POSTHOG_INGEST_HOST}/:path*`,
      },
    ];
  },
};

export default nextConfig;
