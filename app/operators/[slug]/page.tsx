import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase";
import { countryFlag, countryName, countrySlug } from "@/lib/countries";
import { findOperatorBySlug, loadOperatorSummaries } from "@/lib/operators";
import { isIndexableOperator, NOINDEX_ROBOTS } from "@/lib/indexable";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 604800;

type Props = {
  params: Promise<{ slug: string }>;
};

type Facility = {
  slug: string;
  name: string;
  code: string | null;
  city: string | null;
  country: string;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
};

export async function generateStaticParams() {
  const ops = await loadOperatorSummaries();
  // Static-build only the head — long-tail operators with single facilities
  // still render on demand via ISR but don't bloat the build.
  return ops.filter((o) => o.facility_count >= 2).map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const op = await findOperatorBySlug(slug);
  if (!op) return { title: "Operator not found" };
  const count = op.facility_count.toLocaleString();
  const countryLabel = op.countries === 1 ? "Country" : "Countries";
  const power = op.total_power_mw ? Math.round(op.total_power_mw).toLocaleString() : null;
  // Numeric-lead title for CTR. Keeps count + scope in the first ~50 chars
  // so the SERP snippet survives mobile truncation.
  const title = `${op.name} Data Centers — All ${count} Facilities in ${op.countries} ${countryLabel}`;
  const year = new Date().getFullYear();
  const description = `All ${count} ${op.name} data centers mapped across ${op.countries} ${
    op.countries === 1 ? "country" : "countries"
  }${power ? `, ${power} MW capacity` : ""}, live network and IXP data, updated ${year}.`;
  const canonical = `/operators/${slug}`;
  const indexable = await isIndexableOperator(slug);
  return {
    title,
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: NOINDEX_ROBOTS }),
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

const loadFacilitiesForOperator = unstable_cache(
  async (operatorName: string): Promise<Facility[]> => {
    const sb = supabaseServer();
    const facilities: Facility[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await sb
        .from("data_centers")
        .select("slug, name, code, city, country, status, power_mw, space_sqft")
        .eq("operator", operatorName)
        .neq("status", "decommissioned")
        .order("country")
        .order("city")
        .order("name")
        .range(from, from + 999)
        .returns<Facility[]>();
      if (error) throw error;
      if (!data || data.length === 0) break;
      facilities.push(...data);
      if (data.length < 1000) break;
    }
    return facilities;
  },
  ["operator-facilities-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export default async function OperatorPage({ params }: Props) {
  const { slug } = await params;
  const op = await findOperatorBySlug(slug);
  if (!op) notFound();

  let facilities: Facility[];
  try {
    facilities = await loadFacilitiesForOperator(op.name);
  } catch (e) {
    console.error("[operators/[slug]]", e);
    notFound();
  }

  const byCountry = new Map<string, Facility[]>();
  for (const f of facilities) {
    const list = byCountry.get(f.country) ?? [];
    list.push(f);
    byCountry.set(f.country, list);
  }
  const countriesSorted = [...byCountry.entries()].sort((a, b) => b[1].length - a[1].length);
  const totalMw = facilities.reduce((sum, f) => sum + (f.power_mw ?? 0), 0);
  const totalSqft = facilities.reduce((sum, f) => sum + (f.space_sqft ?? 0), 0);

  const summary = `${op.name} operates ${facilities.length} data center${
    facilities.length === 1 ? "" : "s"
  } across ${countriesSorted.length} countr${countriesSorted.length === 1 ? "y" : "ies"}${
    totalMw > 0 ? `, with ${Math.round(totalMw).toLocaleString()} MW of published power capacity` : ""
  }${totalSqft > 0 ? ` and ${totalSqft.toLocaleString()} sqft of published floor space` : ""}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/operators/${slug}`,
    name: `${op.name} data centers`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    about: {
      "@type": "Organization",
      name: op.name,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: facilities.length,
      itemListElement: facilities.map((f, i) => ({
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
      <SimpleHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Operator</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{op.name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Facilities" value={facilities.length.toLocaleString()} />
          <StatBox label="Countries" value={countriesSorted.length.toLocaleString()} />
          <StatBox label="Total power" value={totalMw > 0 ? `${Math.round(totalMw).toLocaleString()} MW` : "—"} />
          <StatBox label="Total space" value={totalSqft > 0 ? `${Math.round(totalSqft / 1000).toLocaleString()}k sqft` : "—"} />
        </div>

        {countriesSorted.map(([country, list]) => (
          <section key={country} className="mt-10">
            <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <span className="text-base leading-none">{countryFlag(country)}</span>
              <Link href={`/countries/${countrySlug(country)}`} className="hover:underline">
                {countryName(country)}
              </Link>
              <span className="text-xs text-zinc-500">({list.length})</span>
            </h2>
            <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
              {list.map((f) => (
                <li key={f.slug} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    {f.code && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                        {f.code}
                      </span>
                    )}
                    <Link href={`/facility/${f.slug}`} className="truncate text-zinc-900 hover:underline dark:text-zinc-100">
                      {f.name}
                    </Link>
                    {f.city && <span className="text-xs text-zinc-500">{f.city}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-zinc-500">
                    {f.power_mw != null && <span>{f.power_mw} MW</span>}
                    {f.space_sqft != null && <span>{f.space_sqft.toLocaleString()} sqft</span>}
                    {f.status !== "operational" && <span>{f.status}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/operators" className="hover:underline">
            ← All operators
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

function SimpleHeader() {
  return (
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
  );
}
