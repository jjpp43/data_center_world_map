import Link from "next/link";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { loadIxpSummaries } from "@/lib/ixps-data";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Internet exchange points (IXPs)",
  description:
    "Every tracked Internet Exchange Point worldwide — DE-CIX, AMS-IX, LINX, IX.br, and 1,300+ more. Ranked by network membership count.",
  alternates: { canonical: "/ixps" },
  openGraph: {
    title: "Internet exchange points · datacenters.world",
    description: "Every tracked IXP worldwide, ranked by member networks.",
    type: "website",
    url: "/ixps",
  },
};

export default async function IxpsIndex() {
  const ixps = await loadIxpSummaries();
  const withMembers = ixps.filter((i) => i.facility_count > 0 || (i.net_count ?? 0) > 0);
  const totalNets = withMembers.reduce((sum, i) => sum + (i.net_count ?? 0), 0);
  const summary = `${withMembers.length.toLocaleString()} tracked Internet Exchange Points across ${
    new Set(withMembers.map((i) => i.country).filter(Boolean)).size
  } countries, connecting ${totalNets.toLocaleString()} aggregate network memberships.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "/ixps",
    name: "Internet exchange points",
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: withMembers.length,
      itemListElement: withMembers.slice(0, 100).map((i, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `/ixps/${i.slug}`,
        name: i.name,
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
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Internet exchange points</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          An IXP is a neutral switching fabric where networks (ISPs, content providers, enterprises)
          peer directly with each other instead of paying transit. Each IXP operates inside one or
          more colocation facilities — the ports physically live in those buildings.
        </p>

        <ul className="mt-8 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          {withMembers.map((i, idx) => (
            <li key={i.ix_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-10 font-mono text-[10px] tabular-nums text-zinc-400">
                  {String(idx + 1).padStart(4, "0")}
                </span>
                {i.country && <span className="text-base leading-none">{countryFlag(i.country)}</span>}
                <Link
                  href={`/ixps/${i.slug}`}
                  className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  {i.name}
                </Link>
                {i.city && <span className="text-xs text-zinc-500">{i.city}</span>}
                {i.country && (
                  <span className="hidden text-xs text-zinc-500 sm:inline">
                    {countryName(i.country)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-zinc-500">
                {i.net_count != null && (
                  <span>{i.net_count.toLocaleString()} network{i.net_count === 1 ? "" : "s"}</span>
                )}
                {i.facility_count > 0 && (
                  <span>{i.facility_count} facilit{i.facility_count === 1 ? "y" : "ies"}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
