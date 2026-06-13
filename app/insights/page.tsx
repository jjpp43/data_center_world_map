import Link from "next/link";
import type { Metadata } from "next";
import { INSIGHTS } from "@/lib/insights-data";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Insights — long-form data dives",
  description:
    "What the dataset says, not just what's in it. Curated rankings and analysis: most network-dense facilities, largest IXPs, peering-hub metros, and more.",
  alternates: { canonical: "/insights" },
  openGraph: {
    title: "Insights · datacenters.world",
    description: "Curated rankings and analysis from the open data center atlas.",
    type: "website",
    url: "/insights",
  },
};

export default async function InsightsHub() {
  return (
    <div className={`min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
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
        <div className="text-xs uppercase tracking-wider text-zinc-500">Insights</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">What the dataset says</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          The map shows you <em>what&rsquo;s where</em>. These pages distill the patterns inside the
          data: which facilities are the real interconnect hubs, where the world actually peers, and
          which Internet Exchanges anchor the global routing graph.
        </p>

        <ul className="mt-8 space-y-3">
          {INSIGHTS.map((i) => (
            <li key={i.slug}>
              <Link
                href={`/insights/${i.slug}`}
                className="group block rounded-2xl border border-zinc-200/70 bg-white/60 p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                  {i.category}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {i.title}
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
                  dangerouslySetInnerHTML={{ __html: i.one_liner }}
                />
                <div className="mt-3 flex items-center gap-1 text-xs text-blue-600 transition-colors group-hover:text-blue-500 dark:text-blue-400">
                  Read <span aria-hidden>→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-2xl text-sm text-zinc-500">
          More insights ship as the dataset deepens. Each page links straight to the underlying
          facilities, operators, metros, and IXPs — so it&rsquo;s never just a summary, it&rsquo;s a
          map into the data.
        </p>
      </main>
    </div>
  );
}
