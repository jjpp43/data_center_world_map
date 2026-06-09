import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase";
import { countryFlag, countryName } from "@/lib/countries";
import { findCountryByCode, loadCountrySummaries } from "@/lib/countries-data";
import { operatorSlug } from "@/lib/operators";
import { getTheme } from "@/lib/theme";

export const revalidate = 3600;

type Props = {
  params: Promise<{ code: string }>;
};

type Facility = {
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  city: string | null;
  region: string | null;
  country: string;
  status: string;
  power_mw: number | null;
  space_sqft: number | null;
};

export async function generateStaticParams() {
  const all = await loadCountrySummaries();
  return all.map((c) => ({ code: c.code.toLowerCase() }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const c = await findCountryByCode(code);
  if (!c) return { title: "Country not found" };
  const name = countryName(c.code);
  const description = `${c.facility_count.toLocaleString()} data center${
    c.facility_count === 1 ? "" : "s"
  } in ${name} operated by ${c.operators} distinct operator${c.operators === 1 ? "" : "s"}${
    c.total_power_mw ? `, totaling ${Math.round(c.total_power_mw).toLocaleString()} MW of published power capacity` : ""
  }. Full facility list with operators, locations, and specs.`;
  const canonical = `/countries/${code.toLowerCase()}`;
  return {
    title: `Data centers in ${name}`,
    description,
    alternates: { canonical },
    openGraph: { title: `Data centers in ${name}`, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title: `Data centers in ${name}`, description },
  };
}

export default async function CountryPage({ params }: Props) {
  const { code } = await params;
  const c = await findCountryByCode(code);
  if (!c) notFound();
  const upper = c.code;
  const name = countryName(upper);

  const sb = supabaseServer();
  const facilities: Facility[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("slug, name, operator, code, city, region, country, status, power_mw, space_sqft")
      .eq("country", upper)
      .neq("status", "decommissioned")
      .order("city")
      .order("operator")
      .order("name")
      .range(from, from + 999)
      .returns<Facility[]>();
    if (error) {
      console.error("[countries/[code]]", error);
      notFound();
    }
    if (!data || data.length === 0) break;
    facilities.push(...data);
    if (data.length < 1000) break;
  }

  // Group by city for a useful reading order
  const byCity = new Map<string, Facility[]>();
  for (const f of facilities) {
    const key = f.city ?? "(Unknown city)";
    const list = byCity.get(key) ?? [];
    list.push(f);
    byCity.set(key, list);
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);
  const totalMw = facilities.reduce((sum, f) => sum + (f.power_mw ?? 0), 0);
  const operatorSet = new Set(facilities.map((f) => f.operator).filter((o): o is string => !!o));

  const summary = `${name} hosts ${facilities.length.toLocaleString()} data center${
    facilities.length === 1 ? "" : "s"
  } across ${cities.length} cit${cities.length === 1 ? "y" : "ies"}, operated by ${operatorSet.size} distinct operator${
    operatorSet.size === 1 ? "" : "s"
  }${totalMw > 0 ? `, with ${Math.round(totalMw).toLocaleString()} MW of published power capacity` : ""}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/countries/${upper.toLowerCase()}`,
    name: `Data centers in ${name}`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    about: { "@type": "Country", name },
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

  const theme = await getTheme();
  return (
    <div className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SimpleHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Country</div>
        <h1 className="mt-1 flex items-center gap-3 text-4xl font-semibold tracking-tight">
          <span className="text-3xl leading-none">{countryFlag(upper)}</span>
          <span>{name}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Facilities" value={facilities.length.toLocaleString()} />
          <StatBox label="Cities" value={cities.length.toLocaleString()} />
          <StatBox label="Operators" value={operatorSet.size.toLocaleString()} />
          <StatBox label="Total power" value={totalMw > 0 ? `${Math.round(totalMw).toLocaleString()} MW` : "—"} />
        </div>

        {cities.map(([city, list]) => (
          <section key={city} className="mt-10">
            <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <span>{city}</span>
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
                    {f.operator && (
                      <Link
                        href={`/operators/${operatorSlug(f.operator)}`}
                        className="text-xs text-zinc-500 hover:underline"
                      >
                        {f.operator}
                      </Link>
                    )}
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
          <Link href="/countries" className="hover:underline">
            ← All countries
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
