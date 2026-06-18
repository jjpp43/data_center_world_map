import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import { PostHogProvider, PostHogPageView } from "@/components/PostHog";
import { jsonForHtml } from "@/lib/json-ld";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

// Inline pre-paint script: read the dcw-theme cookie and toggle .dark on
// <html> before React hydrates. Default is dark (no cookie OR cookie !== light).
// Kept inline + before <body> so there's no flash of wrong theme. The home
// page's theme-toggle effect keeps it in sync after hydration.
const THEME_BOOTSTRAP_SCRIPT = `
try {
  var m = document.cookie.match(/(?:^|; )dcw-theme=([^;]+)/);
  if (!m || m[1] !== 'light') document.documentElement.classList.add('dark');
} catch (_) { document.documentElement.classList.add('dark'); }
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "datacenters.world — every data center on the map",
    template: "%s · datacenters.world",
  },
  description:
    "An open, sourced map of every data center (data centre) on Earth — 5,300+ facilities across 148 countries with verified specs, operators, networks, and IXPs.",
  keywords: [
    "data center map",
    "data centre map",
    "data centers map",
    "data centres map",
    "data centers",
    "data centres",
    "colocation",
    "Equinix",
    "Digital Realty",
    "PeeringDB",
    "cloud regions",
    "Internet exchange",
    "interconnect",
  ],
  applicationName: "datacenters.world",
  authors: [{ name: "Junna Park" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "datacenters.world",
    title: "datacenters.world — every data center on the map",
    description:
      "An open, sourced map of every serious data center on Earth — 5,300+ facilities across 148 countries.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "datacenters.world — every data center on the map",
    description:
      "An open, sourced map of every serious data center on Earth — 5,300+ facilities across 148 countries.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "datacenters.world",
      description:
        "An open, sourced map of every serious data center on Earth — facility locations, operators, specs, networks, and IXPs.",
      inLanguage: "en",
      publisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "datacenters.world",
      url: SITE,
      founder: { "@type": "Person", name: "Junna Park" },
    },
    // Dataset schema unlocks Google's Dataset-result card and gives answer
    // engines (ChatGPT, Gemini, Perplexity) a canonical structured payload
    // to quote when asked "how many data centers are there" type questions.
    // Counts kept hand-synced with CLAUDE.md → "Current status".
    {
      "@type": "Dataset",
      "@id": `${SITE}/#dataset`,
      name: "datacenters.world atlas",
      description:
        "An open, curated atlas of every known data center (data centre) on Earth — 5,675 verified facilities across 148 countries, with operators, power capacity, space, tier, PUE, the 34,732 networks (ASNs) and 1,309 Internet exchanges present at each site, and 176 hyperscale cloud regions (AWS, Google, Azure, Oracle). Sources cited per row.",
      url: SITE,
      creator: { "@id": `${SITE}/#org` },
      publisher: { "@id": `${SITE}/#org` },
      isAccessibleForFree: true,
      keywords: [
        "data center map",
        "data centre map",
        "data centers worldwide",
        "data centres worldwide",
        "colocation directory",
        "PeeringDB",
        "Equinix",
        "Digital Realty",
        "Internet exchange points",
        "IXP",
        "cloud regions",
      ],
      spatialCoverage: "Worldwide",
      variableMeasured: [
        "Facility name",
        "Operator",
        "Geographic coordinates (latitude, longitude)",
        "Country and city",
        "Power capacity (MW)",
        "Space (sqft)",
        "Uptime Institute tier",
        "PUE",
        "Networks (ASNs) present",
        "Internet exchanges present",
        "Cloud regions",
      ],
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${SITE}/api/v1/facilities`,
          name: "Facilities API (JSON)",
        },
        {
          "@type": "DataDownload",
          encodingFormat: "text/csv",
          contentUrl: `${SITE}/api/v1/facilities?format=csv`,
          name: "Facilities API (CSV)",
        },
      ],
      includedInDataCatalog: { "@id": `${SITE}/#website` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="h-full font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonForHtml(SITE_JSON_LD) }}
        />
        <PostHogProvider>
          <PostHogPageView />
          <SessionProvider>{children}</SessionProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
