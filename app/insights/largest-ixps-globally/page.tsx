import Link from "next/link";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { loadIxpSummaries } from "@/lib/ixps-data";
import { getTheme } from "@/lib/theme";

export const revalidate = 86400;

const TOP_N = 25;

export const metadata: Metadata = {
  title: "The 25 largest Internet Exchange Points by membership",
  description:
    "DE-CIX, AMS-IX, MSK-IX, IX.br, LINX — Internet Exchanges ranked by member networks. Where the world's networks meet to peer.",
  alternates: { canonical: "/insights/largest-ixps-globally" },
  openGraph: {
    title: "The 25 largest Internet Exchange Points by membership",
    description: "The Internet Exchanges that anchor global peering.",
    type: "article",
    url: "/insights/largest-ixps-globally",
  },
};

export default async function LargestIxpsInsight() {
  const all = await loadIxpSummaries();
  const top = all
    .filter((i) => i.net_count != null && i.net_count > 0)
    .sort((a, b) => (b.net_count ?? 0) - (a.net_count ?? 0))
    .slice(0, TOP_N);

  const byCountry = new Map<string, number>();
  for (const i of top) {
    if (i.country) byCountry.set(i.country, (byCountry.get(i.country) ?? 0) + 1);
  }
  const countrySpread = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const totalMembers = top.reduce((s, i) => s + (i.net_count ?? 0), 0);
  const lead = top[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "The 25 largest Internet Exchange Points by membership",
    description: "Internet Exchanges ranked by member networks.",
    author: { "@type": "Person", name: "Junna Park" },
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: top.length,
      itemListElement: top.map((i, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `/ixps/${i.slug}`,
        name: i.name,
      })),
    },
  };

  const theme = await getTheme();
  return (
    <div className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/insights" className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            ← Insights
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
          Peering
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          The 25 largest Internet Exchange Points
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          An IXP is a neutral switching fabric where networks peer directly instead of paying
          transit. The biggest IXPs anchor entire regional internets. Ranked by member-network
          count, the top 25 connect{" "}
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
            {totalMembers.toLocaleString()}
          </span>{" "}
          aggregate network memberships across{" "}
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
            {countrySpread.length}
          </span>{" "}
          countries.
        </p>
        {lead && lead.net_count && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
            #1 is{" "}
            <Link href={`/ixps/${lead.slug}`} className="text-zinc-900 hover:underline dark:text-zinc-100">
              {lead.name}
            </Link>{" "}
            with{" "}
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {lead.net_count.toLocaleString()}
            </span>{" "}
            member networks — a single peering fabric reaching most of the global routing graph.
          </p>
        )}

        {countrySpread.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Country concentration in the top {TOP_N}
            </h2>
            <div className="flex flex-wrap gap-2">
              {countrySpread.map(([cc, n]) => (
                <Link
                  key={cc}
                  href={`/countries/${cc.toLowerCase()}`}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200/70 bg-white/60 px-2.5 py-1 text-xs hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
                >
                  <span className="text-sm leading-none">{countryFlag(cc)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{countryName(cc)}</span>
                  <span className="tabular-nums text-zinc-500">{n}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            The list
          </h2>
          <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {top.map((i, idx) => (
              <li key={i.ix_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 font-mono text-[10px] tabular-nums text-zinc-400">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  {i.country && <span className="text-base leading-none">{countryFlag(i.country)}</span>}
                  <Link
                    href={`/ixps/${i.slug}`}
                    className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {i.name}
                  </Link>
                  {i.city && <span className="text-xs text-zinc-500">{i.city}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {(i.net_count ?? 0).toLocaleString()} networks
                  </span>
                  {i.facility_count > 0 && (
                    <span className="text-zinc-500">
                      {i.facility_count} facilit{i.facility_count === 1 ? "y" : "ies"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Member-network counts come from PeeringDB. Some IXPs publish stats showing peak traffic in
          terabits per second — those numbers can shuffle the ranking by traffic volume, but
          membership is the most stable, comparable signal across regions.
        </p>

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/insights" className="hover:underline">
            ← All insights
          </Link>
        </div>
      </main>
    </div>
  );
}
