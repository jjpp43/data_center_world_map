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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
