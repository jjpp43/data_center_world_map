import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { countryFlag, countryName, countrySlug } from "@/lib/countries";
import {
  loadCountrySummaries,
  resolveCountryParam,
} from "@/lib/countries-data";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";
import { CITY_MIN_FACILITIES } from "@/lib/indexable";
import { loadFacilitiesForCountry, type CountryFacilityRow, worldCityHref } from "@/lib/city-locations-data";
import { normalizeUsState, usCitySlug, usStateHref, usStateName } from "@/lib/us-states";

// 30d, matching /facility. Aggregate pages only change on ingest (which can
// --rebuild), so a 7d cycle was spending 4x the ISR writes for no freshness.
export const revalidate = 2_592_000;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

// Captured once at module load so descriptions render byte-identically
// across revalidations within a year — keeps ISR write-skip working.
const YEAR = new Date().getFullYear();

type Props = {
  params: Promise<{ code: string }>;
};

type Facility = CountryFacilityRow;

export async function generateStaticParams() {
  const all = await loadCountrySummaries();
  return all.map((c) => ({ code: countrySlug(c.code) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const resolved = await resolveCountryParam(code);
  if (!resolved) return { title: "Country not found" };
  const { country: c, canonicalSlug } = resolved;
  const name = countryName(c.code);
  const count = c.facility_count.toLocaleString("en-US");
  const power = c.total_power_mw ? Math.round(c.total_power_mw).toLocaleString("en-US") : null;
  const title = `${name} Data Centers — All ${count} Facilities (Free Map)`;
  const description = `All ${count} ${name} data centers mapped — ${c.operators} operator${
    c.operators === 1 ? "" : "s"
  }${power ? `, ${power} MW capacity` : ""}, live network and IXP data, updated ${YEAR}.`;
  const canonical = `/countries/${canonicalSlug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CountryPage({ params }: Props) {
  const { code } = await params;
  const resolved = await resolveCountryParam(code);
  if (!resolved) notFound();
  if (!resolved.isCanonical) permanentRedirect(`/countries/${resolved.canonicalSlug}`);
  const c = resolved.country;
  const upper = c.code;
  const name = countryName(upper);

  let facilities: Facility[];
  try {
    facilities = await loadFacilitiesForCountry(upper);
  } catch (e) {
    console.error("[countries/[code]]", e);
    notFound();
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

  const summary = `${name} hosts ${facilities.length.toLocaleString("en-US")} data center${
    facilities.length === 1 ? "" : "s"
  } across ${cities.length} cit${cities.length === 1 ? "y" : "ies"}, operated by ${operatorSet.size} distinct operator${
    operatorSet.size === 1 ? "" : "s"
  }${totalMw > 0 ? `, with ${Math.round(totalMw).toLocaleString("en-US")} MW of published power capacity` : ""}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `/countries/${resolved.canonicalSlug}`,
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

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", item: `${SITE}/` },
      { name: "Countries", item: `${SITE}/countries` },
      { name, item: `${SITE}/countries/${resolved.canonicalSlug}` },
    ].map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.item })),
  };

  return (
    <div className={`min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(breadcrumbJsonLd) }} />
      <SimpleHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Country</div>
        <h1 className="mt-1 flex items-center gap-3 text-4xl font-semibold tracking-tight">
          <span className="text-3xl leading-none">{countryFlag(upper)}</span>
          <span>{name}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBox label="Facilities" value={facilities.length.toLocaleString("en-US")} />
          <StatBox label="Cities" value={cities.length.toLocaleString("en-US")} />
          <StatBox label="Operators" value={operatorSet.size.toLocaleString("en-US")} />
          <StatBox label="Total power" value={totalMw > 0 ? `${Math.round(totalMw).toLocaleString("en-US")} MW` : "—"} />
        </div>

        {upper === "US" && <UsStateGrid facilities={facilities} />}

        {cities.map(([city, list]) => {
          const slug = city === "(Unknown city)" ? "" : usCitySlug(city);
          const cityLinked = upper !== "US" && slug.length > 0 && list.length >= CITY_MIN_FACILITIES;
          return (
            <section key={city} className="mt-10">
              <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {cityLinked ? (
                  <Link href={worldCityHref(upper, slug)} className="hover:underline">
                    {city}
                  </Link>
                ) : (
                  <span>{city}</span>
                )}
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
                      {f.space_sqft != null && <span>{f.space_sqft.toLocaleString("en-US")} sqft</span>}
                      {f.status !== "operational" && <span>{f.status}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/countries" className="hover:underline">
            ← All countries
          </Link>
        </div>
      </main>
    </div>
  );
}

function UsStateGrid({ facilities }: { facilities: Facility[] }) {
  const counts = new Map<string, number>();
  for (const f of facilities) {
    const code = normalizeUsState(f.region);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const states = [...counts.entries()]
    .map(([code, n]) => ({ code, name: usStateName(code), n }))
    .sort((a, b) => b.n - a.n);
  if (states.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">By state</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {states.map((s) => (
          <li key={s.code}>
            <Link
              href={usStateHref(s.code)}
              className="flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-white/60 px-4 py-3 text-sm hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
            >
              <span className="text-zinc-900 dark:text-zinc-100">{s.name}</span>
              <span className="font-mono text-xs tabular-nums text-zinc-500">
                {s.n.toLocaleString("en-US")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
