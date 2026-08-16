import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase";
import { countryFlag, countryName } from "@/lib/countries";
import {
  EditorialShell,
  Gap,
  RankedRow,
  SectionHeader,
  sheetLink,
} from "@/components/editorial";

export const revalidate = 2_592_000;

export const metadata: Metadata = {
  title: "About",
  description:
    "datacenters.world is an open, sourced map of every serious data center on Earth — 5,300+ facilities across 148 countries with verified specs, operators, networks, and IXPs.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About datacenters.world",
    description:
      "An open, sourced map of every serious data center on Earth — verified specs, operators, networks, and IXPs.",
    type: "article",
    url: "/about",
  },
};

type CountRow = { country: string };
type OperatorRow = { operator: string | null };

async function loadStats() {
  const sb = supabaseServer();

  const [
    { count: facilitiesTotal },
    { count: cloudRegions },
    { count: networks },
    { count: ixes },
  ] = await Promise.all([
    sb.from("data_centers").select("*", { count: "exact", head: true }).neq("status", "decommissioned"),
    sb.from("cloud_regions").select("*", { count: "exact", head: true }),
    sb.from("networks").select("*", { count: "exact", head: true }),
    sb.from("ixes").select("*", { count: "exact", head: true }),
  ]);

  const { data: byCountryRaw } = await sb
    .from("data_centers")
    .select("country")
    .neq("status", "decommissioned")
    .limit(10000)
    .returns<CountRow[]>();
  const countryCounts = new Map<string, number>();
  for (const r of byCountryRaw ?? []) {
    countryCounts.set(r.country, (countryCounts.get(r.country) ?? 0) + 1);
  }
  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const { data: byOpRaw } = await sb
    .from("data_centers")
    .select("operator")
    .eq("country", "US")
    .neq("status", "decommissioned")
    .limit(10000)
    .returns<OperatorRow[]>();
  const opCounts = new Map<string, number>();
  for (const r of byOpRaw ?? []) {
    const op = r.operator ?? "Unknown";
    opCounts.set(op, (opCounts.get(op) ?? 0) + 1);
  }
  const topUsOperators = [...opCounts.entries()]
    .filter(([op]) => op !== "Unknown")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return {
    facilitiesTotal: facilitiesTotal ?? 0,
    cloudRegions: cloudRegions ?? 0,
    networks: networks ?? 0,
    ixes: ixes ?? 0,
    uniqueCountries: countryCounts.size,
    topCountries,
    topUsOperators,
  };
}

export default async function AboutPage() {
  const stats = await loadStats();
  const maxCountry = stats.topCountries[0]?.[1] ?? 1;
  const maxOperator = stats.topUsOperators[0]?.[1] ?? 1;
  const facilities = stats.facilitiesTotal.toLocaleString("en-US");

  return (
    <EditorialShell active="about">
      <h1 className="text-3xl font-semibold tracking-tight">About</h1>
      <p className="mt-3 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
        An open atlas of every serious data center on Earth. Sourced, deduplicated, and built
        to be more useful than the directories that came before it. Free to use, free to cite.{" "}
        <Link href="/methodology" className={sheetLink}>
          Read the methodology
        </Link>
        .
      </p>

      <section className="mt-14">
        <SectionHeader>By the numbers</SectionHeader>
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          <LegendStat label="Data centers" value={facilities} />
          <LegendStat label="Countries" value={stats.uniqueCountries.toString()} />
          <LegendStat
            label="Cloud regions"
            value={stats.cloudRegions.toLocaleString("en-US")}
          />
          <LegendStat label="Networks · ASNs" value={stats.networks.toLocaleString("en-US")} />
        </dl>
        <p className="mt-3 text-sm text-zinc-500">
          {stats.ixes.toLocaleString("en-US")} internet exchanges
        </p>
      </section>

      <section className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div>
          <SectionHeader>Top countries</SectionHeader>
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {stats.topCountries.map(([cc, n], i) => (
              <RankedRow
                key={cc}
                rank={i + 1}
                label={countryName(cc) ?? cc}
                value={n}
                count={n}
                maxCount={maxCountry}
                prefix={<span className="text-base leading-none">{countryFlag(cc)}</span>}
              />
            ))}
          </ul>
        </div>
        <div>
          <SectionHeader>Top US operators</SectionHeader>
          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {stats.topUsOperators.map(([op, n], i) => (
              <RankedRow
                key={op}
                rank={i + 1}
                label={op}
                value={n}
                count={n}
                maxCount={maxOperator}
              />
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeader>What&rsquo;s not here yet</SectionHeader>
        <p className="mt-5 max-w-2xl text-zinc-500">
          We track{" "}
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-50">{facilities}</span>{" "}
          facilities. Permissive directories list ~4,000 in the US alone. The difference is
          definition, not sloppiness — see the{" "}
          <Link href="/methodology" className={sheetLink}>
            inclusion criteria
          </Link>
          . Work in flight:
        </p>
        <ul className="mt-5 space-y-5">
          <Gap title="Hyperscale buildings" impact="+300–500" effort="researching">
            Microsoft, Google, Meta, AWS, and Apple each operate dozens of buildings. Microsoft
            and Google publish addresses for ESG reporting — we&rsquo;ll scrape those.
          </Gap>
          <Gap title="More operators" impact="+80–150" effort="in flight">
            Iron Mountain, H5, Vantage, Aligned/ODATA, NEXTDC, and STACK are in. Next: Compass, T5
            (location pages currently unpublished), Sabey, Switch, Element Critical.
          </Gap>
        </ul>
      </section>

      <section className="mt-16 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          <Link href="/privacy" className={sheetLink}>
            Privacy
          </Link>
          {" · "}
          <a
            href="mailto:info@datacenters.world"
            className="font-mono text-teal-800 underline decoration-teal-300/80 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
          >
            info@datacenters.world
          </a>{" "}
          · Data from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and operator-published facility
          pages · Map tiles by Mapbox
        </p>
      </section>
    </EditorialShell>
  );
}

function LegendStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 font-mono text-2xl tabular-nums tracking-tight text-teal-800 dark:text-teal-300">{value}</dd>
    </div>
  );
}
