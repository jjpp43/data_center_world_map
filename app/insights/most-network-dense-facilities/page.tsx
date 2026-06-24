import Link from "next/link";
import type { Metadata } from "next";
import { countryFlag, countryName, countrySlug } from "@/lib/countries";
import { loadFacilitiesWithCounts } from "@/lib/insights-data";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 86400;

const TOP_N = 50;

export const metadata: Metadata = {
  title: "The 50 most network-dense data centers on Earth",
  description:
    "Ranked by peering networks present. Carrier hotels, interconnect hubs, and the facilities where the global internet actually changes hands.",
  alternates: { canonical: "/insights/most-network-dense-facilities" },
  openGraph: {
    title: "The 50 most network-dense data centers on Earth",
    description: "Ranked by peering networks present — the real interconnect hubs.",
    type: "article",
    url: "/insights/most-network-dense-facilities",
  },
};

export default async function MostDenseInsight() {
  const all = await loadFacilitiesWithCounts();
  const top = all.sort((a, b) => b.network_count - a.network_count).slice(0, TOP_N);

  const byCountry = new Map<string, number>();
  for (const f of top) byCountry.set(f.country, (byCountry.get(f.country) ?? 0) + 1);
  const countrySpread = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const total = top.reduce((s, f) => s + f.network_count, 0);
  const lead = top[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "The 50 most network-dense data centers on Earth",
    description:
      "Ranked by peering networks present — the real interconnect hubs of the global internet.",
    author: { "@type": "Person", name: "Junna Park" },
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: top.length,
      itemListElement: top.map((f, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/facility/${f.slug}`,
        name: f.name,
      })),
    },
  };

  return (
    <div className={`min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(jsonLd) }} />
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
          Networks
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          The 50 most network-dense data centers on Earth
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          A handful of buildings concentrate a disproportionate share of the global internet&rsquo;s
          peering — places where ISPs, content providers, and enterprises terminate their fiber and
          exchange traffic directly. Ranked by PeeringDB network count, the top 50 host{" "}
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
            {total.toLocaleString()}
          </span>{" "}
          network presences across{" "}
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
            {countrySpread.length}
          </span>{" "}
          countries.
        </p>
        {lead && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
            #1 is{" "}
            <Link href={`/facility/${lead.slug}`} className="text-zinc-900 hover:underline dark:text-zinc-100">
              {lead.name}
            </Link>{" "}
            with{" "}
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {lead.network_count.toLocaleString()}
            </span>{" "}
            networks present — a single building reached by more peering networks than most
            countries.
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
                  href={`/countries/${countrySlug(cc)}`}
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
            {top.map((f, i) => (
              <li key={f.slug} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 font-mono text-[10px] tabular-nums text-zinc-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link href={`/facility/${f.slug}`} className="truncate text-zinc-900 hover:underline dark:text-zinc-100">
                    {f.name}
                  </Link>
                  {f.operator && (
                    <Link href={`/operators/${operatorSlug(f.operator)}`} className="text-xs text-zinc-500 hover:underline">
                      {f.operator}
                    </Link>
                  )}
                  {f.city && <span className="text-xs text-zinc-500">{f.city}</span>}
                  <span className="text-base leading-none">{countryFlag(f.country)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {f.network_count.toLocaleString()} networks
                  </span>
                  {f.ix_count > 0 && (
                    <span className="text-zinc-500">{f.ix_count} IXP{f.ix_count === 1 ? "" : "s"}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Network counts come from PeeringDB — the authoritative directory for interconnect-relevant
          presence. Hyperscaler-owned buildings and enterprise data centers don&rsquo;t appear here
          because they don&rsquo;t publish peering presence; their traffic is largely internal.
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
