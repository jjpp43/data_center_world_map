import Link from "next/link";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { loadMetroSummaries } from "@/lib/metros-data";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data center metros",
  description:
    "Every major data center metropolitan area worldwide — Northern Virginia, Frankfurt, Singapore, Tokyo, and 50+ more. Ranked by facility count.",
  alternates: { canonical: "/metros" },
  openGraph: {
    title: "Data center metros · datacenters.world",
    description: "Every major data-center metro worldwide, ranked by facility count.",
    type: "website",
    url: "/metros",
  },
};

export default async function MetrosIndex() {
  const metros = await loadMetroSummaries();
  const totalFacilities = metros.reduce((sum, m) => sum + m.facility_count, 0);
  const summary = `${totalFacilities.toLocaleString()} tracked data centers grouped into ${metros.length} canonical metros — the unit the industry actually uses to measure capacity.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "/metros",
    name: "Data center metros",
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: metros.length,
      itemListElement: metros.map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/metros/${m.slug}`,
        name: m.name,
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
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Data center metros</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          A metro is finer than a country and coarser than a city — a commercial cluster that shares
          latency, fiber, and grid characteristics. Customers buy &ldquo;Frankfurt capacity,&rdquo; not
          &ldquo;Germany capacity.&rdquo;
        </p>

        <ul className="mt-8 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          {metros.map((m, i) => (
            <li key={m.slug} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-8 font-mono text-[10px] tabular-nums text-zinc-400">
                  {String(i + 1).padStart(3, "0")}
                </span>
                <span className="text-base leading-none">{countryFlag(m.country)}</span>
                <Link
                  href={`/metros/${m.slug}`}
                  className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  {m.name}
                </Link>
                {m.short_name && m.short_name !== m.name && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                    {m.short_name}
                  </span>
                )}
                <span className="hidden text-xs text-zinc-500 sm:inline">
                  {countryName(m.country)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-zinc-500">
                <span>{m.facility_count} facilit{m.facility_count === 1 ? "y" : "ies"}</span>
                <span>{m.operator_count} operator{m.operator_count === 1 ? "" : "s"}</span>
                {m.total_power_mw && m.total_power_mw > 0 ? (
                  <span>{Math.round(m.total_power_mw).toLocaleString()} MW</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
