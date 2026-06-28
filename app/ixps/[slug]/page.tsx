import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { countryFlag, countryName, countrySlug } from "@/lib/countries";
import { loadIxpDetail, loadIxpSummaries } from "@/lib/ixps-data";
import { isIndexableIxp, NOINDEX_ROBOTS } from "@/lib/indexable";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 604800;

// Captured once at module load so descriptions render byte-identically
// across revalidations within a year — keeps ISR write-skip working.
const YEAR = new Date().getFullYear();

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const ixps = await loadIxpSummaries();
  return ixps.filter((i) => i.facility_count > 0).map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await loadIxpDetail(slug);
  if (!detail) return { title: "IXP not found" };
  const { ixp, facilities } = detail;
  const where = ixp.city
    ? `${ixp.city}${ixp.country ? `, ${countryName(ixp.country)}` : ""}`
    : ixp.country
    ? countryName(ixp.country)
    : "Global";
  const memberCount = ixp.net_count != null ? ixp.net_count.toLocaleString() : null;
  const facCount = facilities.length.toLocaleString();
  const title = memberCount
    ? `${ixp.name} — ${memberCount} Networks, ${facCount} Facilities`
    : `${ixp.name} — Internet Exchange Point in ${where}`;
  const description = memberCount
    ? `${memberCount} networks peer at ${ixp.name} (${where}) across ${facCount} facilit${
        facilities.length === 1 ? "y" : "ies"
      } — live member list, routing data, updated ${YEAR}.`
    : `${ixp.name} is an Internet Exchange Point in ${where} across ${facCount} facilit${
        facilities.length === 1 ? "y" : "ies"
      } — live member list, peering data, updated ${YEAR}.`;
  const canonical = `/ixps/${slug}`;
  const indexable = await isIndexableIxp(slug);
  return {
    title,
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: NOINDEX_ROBOTS }),
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function IxpPage({ params }: Props) {
  const { slug } = await params;
  const detail = await loadIxpDetail(slug);
  if (!detail) notFound();
  const { ixp, facilities, operator_ranking, country_breakdown } = detail;

  const wherePhrase = ixp.city
    ? `${ixp.city}${ixp.country ? `, ${countryName(ixp.country)}` : ""}`
    : ixp.country
    ? countryName(ixp.country)
    : "—";

  const summary = `${ixp.name} is an Internet Exchange Point${
    ixp.city || ixp.country ? ` serving ${wherePhrase}` : ""
  }${ixp.net_count ? `, with ${ixp.net_count.toLocaleString()} member network${ixp.net_count === 1 ? "" : "s"}` : ""}${
    facilities.length > 0
      ? ` operating across ${facilities.length} colocation facilit${facilities.length === 1 ? "y" : "ies"}`
      : ""
  }.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/ixps/${ixp.slug}`,
    name: `${ixp.name} — Internet Exchange Point`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    about: {
      "@type": "Organization",
      name: ixp.name,
      url: ixp.website ?? undefined,
      address: ixp.country
        ? { "@type": "PostalAddress", addressLocality: ixp.city ?? undefined, addressCountry: ixp.country }
        : undefined,
    },
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
          <span>IXP</span>
          {ixp.country && (
            <>
              <span>·</span>
              <Link
                href={`/countries/${countrySlug(ixp.country)}`}
                className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
              >
                {countryName(ixp.country)}
              </Link>
            </>
          )}
        </div>
        <h1 className="mt-1 flex items-center gap-3 text-4xl font-semibold tracking-tight">
          {ixp.country && <span className="text-3xl leading-none">{countryFlag(ixp.country)}</span>}
          <span>{ixp.name}</span>
        </h1>
        {ixp.name_long && ixp.name_long !== ixp.name && (
          <p className="mt-2 text-sm text-zinc-500">{ixp.name_long}</p>
        )}
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Member networks" value={ixp.net_count != null ? ixp.net_count.toLocaleString() : "—"} />
          <StatBox label="Facilities" value={facilities.length.toLocaleString()} />
          <StatBox label="Operators" value={operator_ranking.length.toLocaleString()} />
          <StatBox label="Countries" value={country_breakdown.length.toLocaleString()} />
        </div>

        {ixp.website && (
          <div className="mt-6">
            <a
              href={ixp.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {ixp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              <span aria-hidden>↗</span>
            </a>
          </div>
        )}

        {operator_ranking.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Top operators hosting {ixp.name}
            </h2>
            <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
              {operator_ranking.slice(0, 10).map((o, i) => (
                <li key={o.operator} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
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

        {facilities.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <span>Facilities hosting {ixp.name}</span>
              <span className="text-xs text-zinc-500">({facilities.length})</span>
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
                    <span className="text-base leading-none">{countryFlag(f.country)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-zinc-500">
                    {f.network_count > 0 && (
                      <span>{f.network_count} network{f.network_count === 1 ? "" : "s"}</span>
                    )}
                    {f.power_mw != null && <span>{f.power_mw} MW</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/ixps" className="hover:underline">
            ← All Internet Exchange Points
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
