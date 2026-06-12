import type { NextConfig } from "next";

const SUPABASE_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "*.supabase.co";
  try {
    return new URL(url).host;
  } catch {
    return "*.supabase.co";
  }
})();

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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return Object.entries(OPERATOR_ALIASES).map(([from, to]) => ({
      source: `/operators/${from}`,
      destination: `/operators/${to}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
