import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { operatorSlug } from "@/lib/operators";
import { jsonForHtml } from "@/lib/json-ld";
import { canonicalOrigin } from "@/lib/census";
import { CITY_MIN_FACILITIES } from "@/lib/indexable";
import { usCitySlug } from "@/lib/us-states";
import { resolveCountryParam } from "@/lib/countries-data";
import {
  cityDisplayName,
  countryMapHref,
  facilitiesInWorldCity,
  loadFacilitiesForCountry,
  worldCityHref,
  type CountryFacilityRow,
} from "@/lib/city-locations-data";
import { operatorRanking } from "@/lib/us-locations-data";

const SITE = canonicalOrigin();
const YEAR = new Date().getFullYear();

export async function worldCityMetadata(codeParam: string, placeParam: string): Promise<Metadata> {
  const country = await resolveCountryParam(codeParam);
  const citySlug = placeParam ? usCitySlug(placeParam) : "";
  if (!country || !citySlug) return { title: "City not found" };
  const rows = facilitiesInWorldCity(await loadFacilitiesForCountry(country.country.code), citySlug);
  if (rows.length < CITY_MIN_FACILITIES) return { title: "City not found" };
  const label = cityDisplayName(rows, citySlug);
  const nation = countryName(country.country.code);
  const count = rows.length.toLocaleString("en-US");
  const operators = operatorRanking(rows).length;
  const power = Math.round(rows.reduce((sum, f) => sum + (f.power_mw ?? 0), 0));
  const title = `Data Centers in ${label}, ${nation} — All ${count} Facilities (Free Map)`;
  const description = `All ${count} data centers in ${label}, ${nation} mapped — ${operators} operator${
    operators === 1 ? "" : "s"
  }${power > 0 ? `, ${power.toLocaleString("en-US")} MW capacity` : ""}, live network and IXP data, updated ${YEAR}.`;
  const canonical = worldCityHref(country.country.code, citySlug);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export async function WorldCityPage({
  codeParam,
  placeParam,
}: {
  codeParam: string;
  placeParam: string;
}) {
  const country = await resolveCountryParam(codeParam);
  if (!country) notFound();
  const citySlug = usCitySlug(placeParam);
  if (!citySlug) notFound();
  if (!country.isCanonical || citySlug !== placeParam) {
    permanentRedirect(worldCityHref(country.country.code, citySlug));
  }

  let all: CountryFacilityRow[];
  try {
    all = await loadFacilitiesForCountry(country.country.code);
  } catch (e) {
    console.error("[countries/[code]/[place] city]", e);
    notFound();
  }

  const facilities = facilitiesInWorldCity(all, citySlug);
  if (facilities.length < CITY_MIN_FACILITIES) notFound();

  const label = cityDisplayName(facilities, citySlug);
  const nation = countryName(country.country.code);
  const operators = operatorRanking(facilities);
  const totalMw = facilities.reduce((sum, f) => sum + (f.power_mw ?? 0), 0);
  const countFmt = facilities.length.toLocaleString("en-US");
  const powerFmt = totalMw > 0 ? Math.round(totalMw).toLocaleString("en-US") : null;
  const place = `${label}, ${nation}`;
  const path = worldCityHref(country.country.code, citySlug);
  const mapHref = countryMapHref(country.country.code);
  const countryHref = `/countries/${country.canonicalSlug}`;

  const summary = `${place} hosts ${countFmt} tracked data center${
    facilities.length === 1 ? "" : "s"
  } operated by ${operators.length} distinct operator${
    operators.length === 1 ? "" : "s"
  }${powerFmt ? `, with ${powerFmt} MW of published power capacity` : ""}.`;

  const faqs = [
    {
      q: `Are there data centers in ${place}?`,
      a: `Yes — ${countFmt} data centers in ${label}, ${nation} are mapped on datacenters.world. Each row links to specs, operators, networks, and IXPs when we have them.`,
    },
    {
      q: `How many data centers are in ${place}?`,
      a: `As of ${YEAR}, ${countFmt} facilities are documented in ${label}, ${nation}${
        powerFmt ? `, with ${powerFmt} MW of published power capacity` : ""
      }. This is a floor: sites without public coordinates or operator pages may be missing.`,
    },
    {
      q: `Who operates data centers in ${place}?`,
      a:
        operators.length === 0
          ? `Operator names are incomplete for some ${place} rows.`
          : `${operators.length} operators run facilities in ${place}. The largest by mapped count ${
              operators[0]
                ? `is ${operators[0].operator} (${operators[0].facility_count})`
                : "are listed below"
            }.`,
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE}${path}`,
    url: `${SITE}${path}`,
    name: `Data centers in ${place}`,
    description: summary,
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: `${SITE}/` },
    about: {
      "@type": "City",
      name: label,
      address: {
        "@type": "PostalAddress",
        addressLocality: label,
        addressCountry: country.country.code,
      },
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: facilities.length,
      itemListElement: facilities.slice(0, 100).map((f, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/facility/${f.slug}`,
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
      { name: nation, item: `${SITE}${countryHref}` },
      { name: label, item: `${SITE}${path}` },
    ].map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.item })),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <div className="min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForHtml(faqJsonLd) }} />
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
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <span>City</span>
          <span>·</span>
          <Link href={countryHref} className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-300">
            {countryFlag(country.country.code)} {nation}
          </Link>
        </div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{place}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>
        <p className="mt-3 text-sm">
          <Link href={mapHref} className="text-blue-600 hover:underline dark:text-blue-400">
            View {nation} on the map →
          </Link>
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatBox label="Facilities" value={countFmt} />
          <StatBox label="Operators" value={operators.length.toLocaleString("en-US")} />
          <StatBox label="Total power" value={powerFmt ? `${powerFmt} MW` : "—"} />
        </div>

        {operators.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Top operators in {place}
            </h2>
            <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
              {operators.slice(0, 10).map((o, i) => (
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

        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span>All facilities</span>
            <span className="text-xs text-zinc-500">({facilities.length})</span>
          </h2>
          <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {facilities.map((f) => (
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

        <section className="mt-12">
          <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Data centers in {place}: FAQs
          </h2>
          <dl className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q}>
                <dt className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{faq.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-12 flex items-center gap-4 text-xs text-zinc-500">
          <Link href={countryHref} className="hover:underline">
            ← {nation}
          </Link>
          <Link href={mapHref} className="hover:underline">
            Open map →
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
