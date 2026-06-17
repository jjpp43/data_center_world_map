import Link from "next/link";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { loadCountrySummaries } from "@/lib/countries-data";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data Centers by Country — All 148 Countries Ranked (Free Map)",
  description:
    "Data center (data centre) counts and capacity for every country with a tracked facility — 148 countries, 5,675 facilities. Browse the map ranked by count.",
  alternates: { canonical: "/countries" },
  openGraph: {
    title: "Data Centers by Country — All 148 Countries Ranked",
    description:
      "Data center counts and capacity for every country — 148 countries, 5,675 facilities.",
    type: "website",
    url: "/countries",
  },
};

export default async function CountriesIndex() {
  const countries = await loadCountrySummaries();
  const totalFacilities = countries.reduce((sum, c) => sum + c.facility_count, 0);
  const summary = `${totalFacilities.toLocaleString()} tracked data centers across ${countries.length} countries.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "/countries",
    name: "Data centers by country",
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: countries.length,
      itemListElement: countries.slice(0, 50).map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/countries/${c.code.toLowerCase()}`,
        name: countryName(c.code),
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
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Data centers by country</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>

        <ul className="mt-8 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          {countries.map((c, i) => (
            <li key={c.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-8 font-mono text-[10px] tabular-nums text-zinc-400">
                  {String(i + 1).padStart(3, "0")}
                </span>
                <span className="text-base leading-none">{countryFlag(c.code)}</span>
                <Link href={`/countries/${c.code.toLowerCase()}`} className="truncate text-zinc-900 hover:underline dark:text-zinc-100">
                  {countryName(c.code)}
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-zinc-500">
                <span>{c.facility_count} facilit{c.facility_count === 1 ? "y" : "ies"}</span>
                <span>{c.operators} operator{c.operators === 1 ? "" : "s"}</span>
                {c.total_power_mw && c.total_power_mw > 0 ? (
                  <span>{Math.round(c.total_power_mw).toLocaleString()} MW</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
