import Link from "next/link";
import type { Metadata } from "next";
import {
  EditorialHeader,
  MatrixRow,
  Source,
  Test,
} from "@/components/editorial";
import { getTheme } from "@/lib/theme";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How datacenters.world defines a data center, sources its data, matches and dedupes records, and what scope is intentionally excluded.",
  alternates: { canonical: "/methodology" },
  openGraph: {
    title: "Methodology · datacenters.world",
    description:
      "Inclusion criteria, data sources, matching rules, and known scope choices for the open data center map.",
    type: "article",
    url: "/methodology",
  },
};

export default async function MethodologyPage() {
  const theme = await getTheme();

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
    >
      <EditorialHeader active="methodology" />

      <main className="relative mx-auto max-w-5xl px-6 py-12">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
        />

        <div className="max-w-3xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            §1 · How we draw the line
          </div>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            Methodology.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            Directories disagree about what counts as a data center by a factor of three. This
            is where we draw the line, where our data comes from, and how we keep it
            deduplicated across sources.
          </p>
        </div>

        <section className="mt-16">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            §2 · What we map
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
            A facility makes the map only if it passes all five tests.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            <Test
              n="01"
              title="Purpose-built"
              tag="Built to house IT infrastructure, not a side function."
            />
            <Test
              n="02"
              title="Substantial scale"
              tag="≥ 500 kW · 50 cabinets · or 2,500 sqft."
            />
            <Test
              n="03"
              title="Operational"
              tag="Running, or under construction with funding."
            />
            <Test
              n="04"
              title="Distinct facility"
              tag="A named building, floor, or campus — not a rack."
            />
            <Test n="05" title="Verifiable" tag="At least one public, citable source." />
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            §3 · Inclusion matrix
          </h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/40 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200/70 bg-zinc-50/60 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-900/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Category</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                <MatrixRow ok category="Commercial colocation" notes="Equinix, Digital Realty, CoreSite, DataBank…" />
                <MatrixRow ok category="Hyperscale buildings" notes="Each named building, not just the campus" />
                <MatrixRow ok category="Enterprise (≥ 500 kW)" notes="Banks, retail, healthcare — when documented" />
                <MatrixRow ok category="Carrier hotels with tenants" notes="One Wilshire, 60 Hudson, Telehouse…" />
                <MatrixRow ok category="Standalone HPC centers" notes="NCSA, ORNL, etc. Purpose-built and at scale" />
                <MatrixRow ok category="Standalone edge facilities" notes="Vapor IO, Compass Edge — actual buildings" />
                <MatrixRow ok category="Cloud regions" notes="Tracked as a separate layer on the map" />
                <MatrixRow ok category="Government (when public)" notes="DoE/NASA-published, etc." />
                <MatrixRow no category="Pure telco central offices" notes="Switching only — not a data center" />
                <MatrixRow no category="Crypto mining facilities" notes="Different category, different operating model" />
                <MatrixRow no category="University CS server rooms" notes="Research compute is not infrastructure-as-product" />
                <MatrixRow no category="Cabinets at cell towers" notes="Edge compute ≠ a facility" />
                <MatrixRow no category="Server rooms in non-DC buildings" notes="Closet test fails" />
                <MatrixRow no category="Rumored or unannounced sites" notes="Wait for a source" />
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            §4 · Where the data comes from
          </h2>
          <div className="mt-5 divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
            <Source
              name="PeeringDB"
              count="5,256"
              unit="facilities"
              what="The authoritative directory for interconnect-relevant facilities. Operators voluntarily list themselves to make peering arrangements easier."
              url="https://www.peeringdb.com/"
            />
            <Source
              name="OpenStreetMap"
              count="+95"
              unit="net-new"
              what="Crowd-tagged buildings with telecom=data_center. 210 observed, 115 deduped against PeeringDB. Useful for facilities outside the interconnect ecosystem."
              url="https://www.openstreetmap.org/"
            />
            <Source
              name="Operator websites"
              count="480"
              unit="enriched"
              what="Equinix, Digital Realty, DataBank, Cologix, CoreSite, CyrusOne, and QTS publish per-facility spec pages. These add power capacity, cabinet density, UPS topology, certifications, and other operational details that PeeringDB doesn't capture."
              url={null}
            />
            <Source
              name="Cloud provider region pages"
              count="176"
              unit="regions"
              what="AWS, GCP, Azure, Oracle. Tracked as a separate map layer, not in the facility table. A region is a logical grouping of buildings, not a building."
              url={null}
            />
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            §5 · How we match and dedupe
          </h2>
          <div className="mt-3 max-w-2xl space-y-3 text-zinc-600 dark:text-zinc-300">
            <p>
              Each canonical facility row in the database can have many{" "}
              <em>source records</em> linked to it — one for every directory or page where we
              found that facility. When a new source mentions a facility, we try to attach it
              to an existing canonical row before creating a new one. The match function checks{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                (operator, name)
              </code>{" "}
              for an exact match first, then any facility within{" "}
              <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                100m
              </span>
              . If neither hits, the record is logged as an orphan and reviewed before insertion.
            </p>
            <p>
              This is why an Equinix facility known by three different names across PeeringDB,
              OSM, and Equinix&rsquo;s own website still shows up as one row, with three source
              records linked to it.
            </p>
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              §6 · Corrections and submissions
            </h2>
            <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-300">
              Find an error? Know about a facility we&rsquo;re missing? Send the details —
              building name, operator, address, and a verifiable source — and we&rsquo;ll add
              it.
            </p>
            <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-300">
              Operators: if you&rsquo;d like your facility list verified directly rather than
              scraped, get in touch.
            </p>
          </div>
          <Link
            href="/about"
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <span aria-hidden>←</span> Back to About
          </Link>
        </section>

        <section className="mt-16 border-t border-zinc-200/70 pt-6 text-xs text-zinc-500 dark:border-zinc-800/60">
          <p className="font-mono">
            Data from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and operator-published
            facility pages · Map tiles by Mapbox
          </p>
        </section>
      </main>
    </div>
  );
}
