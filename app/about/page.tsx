import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase";
import { countryFlag, countryName } from "@/lib/countries";
import { EditorialHeader, Gap, RankedRow, Stat } from "@/components/editorial";
import { getTheme } from "@/lib/theme";

export const revalidate = 3600;

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
  const [stats, theme] = await Promise.all([loadStats(), getTheme()]);
  const maxCountry = stats.topCountries[0]?.[1] ?? 1;
  const maxOperator = stats.topUsOperators[0]?.[1] ?? 1;

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
    >
      <EditorialHeader active="about" />

      <main className="relative mx-auto max-w-5xl px-6 py-12">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]"
        />

        <div className="max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 live-dot" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span>Live · {stats.facilitiesTotal.toLocaleString()} facilities indexed</span>
          </div>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            An open atlas of <br className="hidden sm:block" />
            <span className="text-zinc-500">every serious data center</span> on Earth.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            Sourced, deduplicated, and built to be more useful than the directories that came
            before it. Free to use, free to cite.{" "}
            <Link
              href="/methodology"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Read the methodology
              <span aria-hidden>→</span>
            </Link>
          </p>
        </div>

        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              By the numbers
            </h2>
            <span className="font-mono text-[10px] text-zinc-400">updated hourly</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              size="hero"
              live
              label="Data centers"
              value={stats.facilitiesTotal.toLocaleString()}
            />
            <Stat size="hero" label="Countries" value={stats.uniqueCountries.toString()} />
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-2xl border border-zinc-200/70 bg-white/60 px-5 py-3 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <InlineTertiary label="cloud regions" value={stats.cloudRegions.toLocaleString()} />
            <Divider />
            <InlineTertiary label="networks · ASNs" value={stats.networks.toLocaleString()} />
            <Divider />
            <InlineTertiary label="internet exchanges" value={stats.ixes.toLocaleString()} />
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Top countries
            </h2>
            <ul className="mt-3 divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
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
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Top US operators
            </h2>
            <ul className="mt-3 divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
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
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            What&rsquo;s not here yet
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
            We track{" "}
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {stats.facilitiesTotal.toLocaleString()}
            </span>{" "}
            facilities. Permissive directories list ~4,000 in the US alone. The difference is
            definition, not sloppiness — see the{" "}
            <Link
              href="/methodology"
              className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              inclusion criteria
            </Link>
            . Work in flight:
          </p>
          <ul className="mt-5 space-y-5">
            <Gap title="Hyperscale buildings" impact="+300–500" effort="researching">
              Microsoft, Google, Meta, AWS, and Apple each operate dozens of buildings. Microsoft
              and Google publish addresses for ESG reporting — we&rsquo;ll scrape those.
            </Gap>
            <Gap title="Operator-page orphans" impact="+200–300" effort="next up">
              234 operator-page records currently unmatched. Most are real facilities not in
              PeeringDB. Geocoding closes the gap.
            </Gap>
            <Gap title="More operators" impact="+150–250" effort="tractable">
              Iron Mountain, Aligned, Stack, Compass, T5, Sabey, Switch, Vantage, H5, Element
              Critical — all publish facility pages. We&rsquo;ve done 7 of the top operators.
            </Gap>
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Corrections
          </h2>
          <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-300">
            Find an error? Know a facility we&rsquo;re missing? Send building name, operator,
            address, and a verifiable source — we&rsquo;ll add it.
          </p>
        </section>

        <section className="mt-16 border-t border-zinc-200/70 pt-6 text-xs text-zinc-500 dark:border-zinc-800/60">
          <p className="font-mono">
            Built by Junna Park · Data from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and
            operator-published facility pages · Map tiles by Mapbox
          </p>
        </section>
      </main>
    </div>
  );
}

function InlineTertiary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-xl tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  );
}

function Divider() {
  return (
    <span aria-hidden className="h-3 w-px bg-zinc-300/70 dark:bg-zinc-700/70" />
  );
}
