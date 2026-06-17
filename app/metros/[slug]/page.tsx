import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { METROS, loadMetroDetail } from "@/lib/metros-data";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 604800;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return METROS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await loadMetroDetail(slug);
  if (!detail) return { title: "Metro not found" };
  const { metro, facilities, operator_ranking, total_power_mw } = detail;
  const country = countryName(metro.country);
  const count = facilities.length.toLocaleString();
  const power = total_power_mw ? Math.round(total_power_mw).toLocaleString() : null;
  const title = `${metro.name} Data Centers — ${count} Facilities, Top Operators`;
  const description = `${count} data centers (data centres) in the ${metro.name} metro (${country}) — ${operator_ranking.length} operator${
    operator_ranking.length === 1 ? "" : "s"
  }${power ? `, ${power} MW capacity` : ""}. Browse the map with networks, IXPs, and power.`;
  const canonical = `/metros/${slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function MetroPage({ params }: Props) {
  const { slug } = await params;
  const detail = await loadMetroDetail(slug);
  if (!detail) notFound();
  const { metro, facilities, operator_ranking, total_power_mw, total_networks } = detail;

  const country = countryName(metro.country);
  const cityCount = new Set(facilities.map((f) => f.city).filter(Boolean)).size;

  const summary = `The ${metro.name} metro hosts ${facilities.length.toLocaleString()} tracked data center${
    facilities.length === 1 ? "" : "s"
  } operated by ${operator_ranking.length} distinct operator${
    operator_ranking.length === 1 ? "" : "s"
  }${total_power_mw ? `, with ${Math.round(total_power_mw).toLocaleString()} MW of published power capacity` : ""}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/metros/${metro.slug}`,
    name: `Data centers in ${metro.name}`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    about: { "@type": "Place", name: metro.name, address: { "@type": "PostalAddress", addressCountry: metro.country } },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: facilities.length,
      itemListElement: facilities.slice(0, 100).map((f, i) => ({
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
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <span>Metro</span>
          <span>·</span>
          <Link href={`/countries/${metro.country.toLowerCase()}`} className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-300">
            {country}
          </Link>
        </div>
        <h1 className="mt-1 flex items-center gap-3 text-4xl font-semibold tracking-tight">
          <span className="text-3xl leading-none">{countryFlag(metro.country)}</span>
          <span>{metro.name}</span>
          {metro.short_name && metro.short_name !== metro.name && (
            <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs uppercase text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
              {metro.short_name}
            </span>
          )}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>
        {metro.blurb && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">{metro.blurb}</p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Facilities" value={facilities.length.toLocaleString()} />
          <StatBox label="Operators" value={operator_ranking.length.toLocaleString()} />
          <StatBox label="Cities" value={cityCount.toLocaleString()} />
          <StatBox label="Networks present" value={total_networks.toLocaleString()} />
        </div>

        {operator_ranking.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Top operators in {metro.name}
            </h2>
            <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
              {operator_ranking.slice(0, 10).map((o, i) => (
                <li
                  key={o.operator}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-6 font-mono text-[10px] tabular-nums text-zinc-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/operators/${operatorSlug(o.operator)}`}
                      className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {o.operator}
                    </Link>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                    {o.facility_count} facilit{o.facility_count === 1 ? "y" : "ies"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span>All facilities</span>
            <span className="text-xs text-zinc-500">({facilities.length})</span>
            <span className="text-xs text-zinc-500">ranked by network density</span>
          </h2>
          <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {facilities.map((f) => (
              <li key={f.slug} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    href={`/facility/${f.slug}`}
                    className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {f.name}
                  </Link>
                  {f.operator && (
                    <Link
                      href={`/operators/${operatorSlug(f.operator)}`}
                      className="text-xs text-zinc-500 hover:underline"
                    >
                      {f.operator}
                    </Link>
                  )}
                  {f.city && <span className="text-xs text-zinc-500">{f.city}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-zinc-500">
                  {f.network_count != null && f.network_count > 0 && (
                    <span>{f.network_count} network{f.network_count === 1 ? "" : "s"}</span>
                  )}
                  {f.power_mw != null && <span>{f.power_mw} MW</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 flex items-center gap-4 text-xs text-zinc-500">
          <Link href="/metros" className="hover:underline">
            ← All metros
          </Link>
          <Link href={`/countries/${metro.country.toLowerCase()}`} className="hover:underline">
            All facilities in {country} →
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-4 dark:border-zinc-800/60 dark:bg-zinc-900/40">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
