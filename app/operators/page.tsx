import Link from "next/link";
import type { Metadata } from "next";
import { loadOperatorSummaries } from "@/lib/operators";
import { getTheme } from "@/lib/theme";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data center operators",
  description:
    "Every data center operator tracked by datacenters.world, ranked by facility count. Equinix, Digital Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS, and the long tail of regional providers.",
  alternates: { canonical: "/operators" },
  openGraph: {
    title: "Data center operators · datacenters.world",
    description: "Every tracked operator, ranked by facility count.",
    type: "website",
    url: "/operators",
  },
};

export default async function OperatorsIndex() {
  const ops = await loadOperatorSummaries();
  const totalFacilities = ops.reduce((sum, o) => sum + o.facility_count, 0);
  const totalMw = ops.reduce((sum, o) => sum + (o.total_power_mw ?? 0), 0);
  const summary = `${ops.length.toLocaleString()} data center operators run ${totalFacilities.toLocaleString()} facilities tracked on datacenters.world${
    totalMw > 0 ? `, with ${Math.round(totalMw).toLocaleString()} MW of published power capacity across the named operators` : ""
  }.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "/operators",
    name: "Data center operators",
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: ops.length,
      itemListElement: ops.slice(0, 50).map((o, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/operators/${o.slug}`,
        name: o.name,
      })),
    },
  };

  const theme = await getTheme();
  return (
    <div className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            ← Back to map
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Index</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Data center operators</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>

        <ul className="mt-8 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          {ops.map((o, i) => (
            <li key={`${o.slug}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-8 font-mono text-[10px] tabular-nums text-zinc-400">
                  {String(i + 1).padStart(3, "0")}
                </span>
                <Link
                  href={`/operators/${o.slug}`}
                  className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  {o.name}
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-zinc-500">
                <span>
                  {o.facility_count} facilit{o.facility_count === 1 ? "y" : "ies"}
                </span>
                <span>{o.countries} countr{o.countries === 1 ? "y" : "ies"}</span>
                {o.total_power_mw && o.total_power_mw > 0 ? (
                  <span>{Math.round(o.total_power_mw).toLocaleString()} MW</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
