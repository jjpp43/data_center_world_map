import Link from "next/link";
import type { Metadata } from "next";
import { loadNetworkSummaries } from "@/lib/networks-data";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 3600;

const TOP_N = 500;

export const metadata: Metadata = {
  title: "Networks (ASNs) — 34,732 in Tracked Data Centers",
  description:
    "Every PeeringDB-registered network present in a tracked data center — Google AS15169, AWS AS16509, Cloudflare AS13335, Microsoft AS8075, and 30,000+ more. Ranked by data center footprint.",
  alternates: { canonical: "/networks" },
  openGraph: {
    title: "Networks (ASNs) — 34,732 in Tracked Data Centers",
    description:
      "Every PeeringDB-registered network — Google, AWS, Cloudflare, Microsoft, and 30,000+ more — ranked by data center footprint.",
    type: "website",
    url: "/networks",
  },
};

function infoTypeBadge(type: string | null): string {
  if (!type) return "";
  return type.replace(/Network Service Provider/i, "NSP").replace(/Educational\/Research/i, "Edu");
}

export default async function NetworksIndex() {
  const all = await loadNetworkSummaries();
  const withFacilities = all.filter((n) => n.facility_count > 0);
  const top = withFacilities.slice(0, TOP_N);

  const summary = `${withFacilities.length.toLocaleString()} networks have a tracked presence in at least one data-center facility. The full list is 34,000+ and addressable by ASN — this page shows the top ${TOP_N.toLocaleString()} by data-center footprint.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "/networks",
    name: "Networks (ASNs)",
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: top.length,
      itemListElement: top.slice(0, 100).map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/networks/${n.asn}`,
        name: `AS${n.asn} ${n.name}`,
      })),
    },
  };

  return (
    <div className={`min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(jsonLd) }} />
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            ← Back to map
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Index</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Networks (ASNs)</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          A network is an Autonomous System (AS) — a routing entity with its own block of IP space.
          Networks &ldquo;present&rdquo; at a facility have peering ports or transit capacity there.
          Direct any URL: <span className="font-mono">/networks/15169</span> (Google),{" "}
          <span className="font-mono">/networks/16509</span> (AWS),{" "}
          <span className="font-mono">/networks/13335</span> (Cloudflare).
        </p>

        <ul className="mt-8 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          {top.map((n, i) => (
            <li key={n.asn} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-10 font-mono text-[10px] tabular-nums text-zinc-400">
                  {String(i + 1).padStart(4, "0")}
                </span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                  AS{n.asn}
                </span>
                <Link
                  href={`/networks/${n.asn}`}
                  className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  {n.name}
                </Link>
                {n.info_type && (
                  <span className="hidden text-xs text-zinc-500 sm:inline">
                    {infoTypeBadge(n.info_type)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-zinc-500">
                {n.info_traffic && <span className="hidden sm:inline">{n.info_traffic}</span>}
                <span>{n.facility_count.toLocaleString()} facilit{n.facility_count === 1 ? "y" : "ies"}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-zinc-500">
          Showing top {TOP_N.toLocaleString()} of {withFacilities.length.toLocaleString()} networks
          with facility presence. Every PeeringDB ASN with ≥2 facility presences is reachable at{" "}
          <span className="font-mono">/networks/[asn]</span> directly — the sitemap and API expose
          the full set.
        </p>
      </main>
    </div>
  );
}
