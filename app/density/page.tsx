import Link from "next/link";
import type { Metadata } from "next";
import { loadDensityIndex } from "@/lib/density";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data centers by network density",
  description:
    "Every tracked colocation facility classified by how many peering networks are present. Ultra-dense (50+), dense (10–49), standard (1–9). The interconnect tier of the colo market.",
  alternates: { canonical: "/density" },
  openGraph: {
    title: "Data centers by network density",
    description: "Ultra-dense, dense, and standard interconnect tiers — ranked.",
    type: "website",
    url: "/density",
  },
};

const ACCENT_BG: Record<string, string> = {
  emerald: "bg-emerald-500/90 dark:bg-emerald-400/90",
  indigo: "bg-indigo-500/90 dark:bg-indigo-400/90",
  zinc: "bg-zinc-400/90 dark:bg-zinc-500/90",
};

export default async function DensityIndex() {
  const idx = await loadDensityIndex();

  const summary = `${idx.total_classified.toLocaleString()} facilities classified by peering-network density. ${idx.total_quiet.toLocaleString()} additional facilities have no PeeringDB-registered networks and are not classified here.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "/density",
    name: "Data centers by network density",
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: idx.tiers.length,
      itemListElement: idx.tiers.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/density/${t.slug}`,
        name: t.label,
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
        <div className="text-xs uppercase tracking-wider text-zinc-500">Classification</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">By network density</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Network count is the single most useful signal for what a colocation facility is{" "}
          <em>for</em>. Carrier hotels and interconnect hubs concentrate the most networks;
          enterprise and hyperscale-leaning buildings concentrate the fewest. PeeringDB only knows
          about networks that publish their peering footprint, so this view skews toward the
          interconnect tier of the market.
        </p>

        <ul className="mt-8 space-y-3">
          {idx.tiers.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/density/${t.slug}`}
                className="group block rounded-2xl border border-zinc-200/70 bg-white/60 p-5 transition-colors hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`inline-block h-4 w-[3px] rounded-sm ${ACCENT_BG[t.accent]}`}
                  />
                  <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.16em] text-zinc-900 dark:text-zinc-50">
                    {t.label}
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">{t.short}</span>
                  <span className="ml-auto font-mono text-base tabular-nums text-zinc-900 dark:text-zinc-100">
                    {t.count.toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
