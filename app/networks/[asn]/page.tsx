import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { countryFlag, countryName, countrySlug } from "@/lib/countries";
import { loadNetworkDetail, loadNetworkSummaries } from "@/lib/networks-data";
import { isIndexableNetwork, NOINDEX_ROBOTS } from "@/lib/indexable";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 604800;

// Captured once at module load so descriptions render byte-identically
// across revalidations within a year — keeps ISR write-skip working.
const YEAR = new Date().getFullYear();

type Props = {
  params: Promise<{ asn: string }>;
};

export async function generateStaticParams() {
  const all = await loadNetworkSummaries();
  return all
    .filter((n) => n.facility_count >= 2)
    .slice(0, 500)
    .map((n) => ({ asn: String(n.asn) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { asn } = await params;
  const asnNum = Number(asn);
  if (!Number.isFinite(asnNum) || asnNum <= 0) return { title: "Network not found" };
  const detail = await loadNetworkDetail(asnNum);
  if (!detail) return { title: "Network not found" };
  const { network, facilities, country_breakdown } = detail;

  const facCount = facilities.length.toLocaleString();
  const title = `AS${network.asn} ${network.name} — ${facCount} Data Center${
    facilities.length === 1 ? "" : "s"
  }, ${country_breakdown.length} ${country_breakdown.length === 1 ? "Country" : "Countries"}`;
  const description = `AS${network.asn} ${network.name} present in ${facCount} data center${
    facilities.length === 1 ? "" : "s"
  } across ${country_breakdown.length} countr${
    country_breakdown.length === 1 ? "y" : "ies"
  } — full facility list, routing policy, peering data, updated ${YEAR}.`;
  const canonical = `/networks/${network.asn}`;
  const indexable = await isIndexableNetwork(network.asn);
  return {
    title,
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: NOINDEX_ROBOTS }),
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function NetworkPage({ params }: Props) {
  const { asn } = await params;
  const asnNum = Number(asn);
  if (!Number.isFinite(asnNum) || asnNum <= 0) notFound();
  const detail = await loadNetworkDetail(asnNum);
  if (!detail) notFound();
  const { network, facilities, operator_ranking, country_breakdown } = detail;

  const summary = `AS${network.asn} ${network.name} is a${
    network.info_type ? ` ${network.info_type.toLowerCase()}` : ""
  } network${
    network.info_scope ? ` with ${network.info_scope.toLowerCase()} scope` : ""
  }, present in ${facilities.length.toLocaleString()} tracked colocation facilit${
    facilities.length === 1 ? "y" : "ies"
  } across ${country_breakdown.length} countr${country_breakdown.length === 1 ? "y" : "ies"}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/networks/${network.asn}`,
    name: `AS${network.asn} ${network.name}`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    about: {
      "@type": "Organization",
      name: network.name,
      identifier: `AS${network.asn}`,
      url: network.website ?? undefined,
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
          <span>Network</span>
          {network.info_type && (
            <>
              <span>·</span>
              <span>{network.info_type}</span>
            </>
          )}
          {network.info_scope && (
            <>
              <span>·</span>
              <span>{network.info_scope}</span>
            </>
          )}
        </div>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-4xl font-semibold tracking-tight">
          <span className="rounded-lg bg-zinc-100 px-2.5 py-1 font-mono text-2xl tabular-nums text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
            AS{network.asn}
          </span>
          <span>{network.name}</span>
        </h1>
        {network.aka && network.aka !== network.name && (
          <p className="mt-2 text-sm text-zinc-500">
            also known as <span className="text-zinc-700 dark:text-zinc-300">{network.aka}</span>
          </p>
        )}
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Facilities" value={facilities.length.toLocaleString()} />
          <StatBox label="Countries" value={country_breakdown.length.toLocaleString()} />
          <StatBox label="Operators" value={operator_ranking.length.toLocaleString()} />
          <StatBox label="Traffic band" value={network.info_traffic ?? "—"} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          {network.policy_general && (
            <span className="rounded-full border border-zinc-200/70 bg-white/60 px-2.5 py-1 text-zinc-600 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:text-zinc-400">
              Peering policy:{" "}
              <span className="text-zinc-900 dark:text-zinc-100">{network.policy_general}</span>
            </span>
          )}
          {network.info_ratio && (
            <span className="rounded-full border border-zinc-200/70 bg-white/60 px-2.5 py-1 text-zinc-600 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:text-zinc-400">
              Ratio: <span className="text-zinc-900 dark:text-zinc-100">{network.info_ratio}</span>
            </span>
          )}
          {network.info_ipv6 && (
            <span className="rounded-full border border-emerald-200/70 bg-emerald-50/60 px-2.5 py-1 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
              IPv6
            </span>
          )}
          {network.website && (
            <a
              href={network.website}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-blue-200/60 bg-blue-50/60 px-2.5 py-1 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
            >
              {network.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
            </a>
          )}
        </div>

        {country_breakdown.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Country footprint
            </h2>
            <div className="flex flex-wrap gap-2">
              {country_breakdown.map((c) => (
                <Link
                  key={c.country}
                  href={`/countries/${countrySlug(c.country)}`}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200/70 bg-white/60 px-2.5 py-1 text-xs hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
                >
                  <span className="text-sm leading-none">{countryFlag(c.country)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{countryName(c.country)}</span>
                  <span className="tabular-nums text-zinc-500">{c.facility_count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {operator_ranking.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Top operators hosting AS{network.asn}
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
              <span>Facilities hosting AS{network.asn}</span>
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
                      <span>{f.network_count.toLocaleString()} network{f.network_count === 1 ? "" : "s"}</span>
                    )}
                    {f.power_mw != null && <span>{f.power_mw} MW</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/networks" className="hover:underline">
            ← All networks
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
