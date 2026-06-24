import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { countryFlag, countryName, countrySlug } from "@/lib/countries";
import { TIERS, loadDensityTier, type DensityTier } from "@/lib/density";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 604800;

type Props = {
  params: Promise<{ tier: string }>;
};

const VALID = new Set(TIERS.map((t) => t.slug));

export async function generateStaticParams() {
  return TIERS.map((t) => ({ tier: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tier } = await params;
  if (!VALID.has(tier as DensityTier)) return { title: "Tier not found" };
  const detail = await loadDensityTier(tier as DensityTier);
  if (!detail) return { title: "Tier not found" };
  const { spec, facilities } = detail;
  const description = `${facilities.length.toLocaleString()} ${spec.label.toLowerCase()} data centers (${spec.short}) ranked by peering-network count. ${spec.blurb}`;
  const canonical = `/density/${spec.slug}`;
  return {
    title: `${spec.label} data centers (${spec.short})`,
    description,
    alternates: { canonical },
    openGraph: { title: `${spec.label} data centers`, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title: `${spec.label} data centers`, description },
  };
}

export default async function TierPage({ params }: Props) {
  const { tier } = await params;
  if (!VALID.has(tier as DensityTier)) notFound();
  const detail = await loadDensityTier(tier as DensityTier);
  if (!detail) notFound();
  const { spec, facilities } = detail;

  const byCountry = new Map<string, number>();
  for (const f of facilities) byCountry.set(f.country, (byCountry.get(f.country) ?? 0) + 1);
  const countryRanking = [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);

  const summary = `${facilities.length.toLocaleString()} tracked data centers with ${
    spec.short
  }, ranked by peering-network count. Spans ${countryRanking.length} countr${countryRanking.length === 1 ? "y" : "ies"}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/density/${spec.slug}`,
    name: `${spec.label} data centers`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
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
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            ← Back to map
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <span>Density</span>
          <span>·</span>
          <Link href="/density" className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-300">
            All tiers
          </Link>
        </div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{spec.label}</h1>
        <p className="mt-2 font-mono text-sm text-zinc-500">{spec.short}</p>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {summary}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">{spec.blurb}</p>

        {countryRanking.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Country distribution
            </h2>
            <div className="flex flex-wrap gap-2">
              {countryRanking.slice(0, 30).map((c) => (
                <Link
                  key={c.country}
                  href={`/countries/${countrySlug(c.country)}`}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200/70 bg-white/60 px-2.5 py-1 text-xs hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
                >
                  <span className="text-sm leading-none">{countryFlag(c.country)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{countryName(c.country)}</span>
                  <span className="tabular-nums text-zinc-500">{c.count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span>All facilities</span>
            <span className="text-xs text-zinc-500">({facilities.length})</span>
            <span className="text-xs text-zinc-500">ranked by network count</span>
          </h2>
          <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {facilities.slice(0, 250).map((f, i) => (
              <li key={f.slug} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-8 font-mono text-[10px] tabular-nums text-zinc-400">
                    {String(i + 1).padStart(3, "0")}
                  </span>
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
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {f.network_count.toLocaleString()} networks
                  </span>
                  {f.power_mw != null && <span>{f.power_mw} MW</span>}
                </div>
              </li>
            ))}
          </ul>
          {facilities.length > 250 && (
            <p className="mt-4 text-xs text-zinc-500">
              Showing top 250 of {facilities.length.toLocaleString()}. The remaining facilities are
              addressable individually under <span className="font-mono">/facility/[slug]</span>.
            </p>
          )}
        </section>

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/density" className="hover:underline">
            ← All density tiers
          </Link>
        </div>
      </main>
    </div>
  );
}
