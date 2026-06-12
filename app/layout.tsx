import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { SessionProvider } from "@/components/SessionProvider";
import { PostHogProvider, PostHogPageView } from "@/components/PostHog";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

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
    "An open, sourced map of every serious data center on Earth — 5,300+ facilities across 148 countries with verified specs, operators, networks, and IXPs.",
  keywords: [
    "data center map",
    "data centers",
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
  ],
};

async function detectInitialSession(): Promise<boolean> {
  // Synchronous cookie check — no Supabase API call. Supabase Auth stores the
  // session as one or more cookies named `sb-<project-ref>-auth-token[.N]`.
  // Presence is good enough for an initial UI hint; the browser client
  // verifies authoritatively.
  const c = await cookies();
  return c.getAll().some(
    (x) => x.name.startsWith("sb-") && x.name.includes("-auth-token"),
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialSignedIn = await detectInitialSession();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
        <PostHogProvider>
          <PostHogPageView />
          <SessionProvider initialSignedIn={initialSignedIn}>
            {children}
          </SessionProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
