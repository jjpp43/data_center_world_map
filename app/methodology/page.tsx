import Link from "next/link";
import type { Metadata } from "next";
import {
  EditorialShell,
  MatrixRow,
  SectionHeader,
  Source,
  Test,
  sheetLink,
} from "@/components/editorial";
import { loadMethodologyStats } from "@/lib/methodology-data";

export const revalidate = 2_592_000;

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

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default async function MethodologyPage() {
  const stats = await loadMethodologyStats();
  const hyperscale = stats.googleBuildings + stats.metaBuildings;

  return (
    <EditorialShell active="methodology">
        <h1 className="text-3xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-3 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
            Directories disagree about what counts as a data center by a factor of three. This
            is where we draw the line, where our data comes from, and how we keep it
            deduplicated across sources.
        </p>

        <section className="mt-16">
          <SectionHeader>What we map</SectionHeader>
          <p className="mt-5 max-w-2xl text-zinc-500">
            A facility makes the map only if it passes all five tests. PeeringDB
            listings are included as interconnect facilities even when power or
            floor area is unpublished — the listing itself is the citable
            evidence. The 500 kW / 50 cabinet / 2,500 sqft floor is applied when
            we ingest operator and hyperscale pages that would otherwise pull in
            smaller sites.
          </p>
          <div className="mt-6 space-y-4">
            <Test
              n="1"
              title="Purpose-built"
              tag="Built to house IT infrastructure, not a side function."
            />
            <Test
              n="2"
              title="Substantial scale"
              tag="≥ 500 kW · 50 cabinets · or 2,500 sqft."
            />
            <Test
              n="3"
              title="Operational"
              tag="Running, or under construction with funding."
            />
            <Test
              n="4"
              title="Distinct facility"
              tag="A named building, floor, or campus — not a rack."
            />
            <Test n="5" title="Verifiable" tag="At least one public, citable source." />
          </div>
        </section>

        <section className="mt-16">
          <SectionHeader>Inclusion matrix</SectionHeader>
          <div className="mt-5 overflow-x-auto border border-zinc-200 dark:border-zinc-800">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[18%]" />
                <col />
              </colgroup>
              <thead className="border-b border-zinc-200 text-left text-sm text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Category</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
          <SectionHeader>Where the data comes from</SectionHeader>
          <div className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
            <Source
              name="PeeringDB"
              count={fmt(stats.peeringdbFacilities)}
              unit="facilities"
              what={`The directory operators use to arrange peering. It is also where networks (${fmt(stats.networks)} ASNs) and internet exchanges (${fmt(stats.ixes)}) come from; we join those to facilities through PeeringDB's published facility links. Most rows start here.`}
              url="https://www.peeringdb.com/"
            />
            <Source
              name="OpenStreetMap"
              count={`+${fmt(stats.osmOnly)}`}
              unit="net-new"
              what={`Crowd-tagged buildings with telecom=data_center. ${fmt(stats.osmRecords)} OSM records; ${fmt(stats.osmOnly)} are facilities PeeringDB does not list. Useful for sites outside the interconnect ecosystem.`}
              url="https://www.openstreetmap.org/"
            />
            <Source
              name="Operator websites"
              count={fmt(stats.operatorFacilities)}
              unit="facilities"
              what="Per-facility pages from Equinix, Digital Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS, Iron Mountain, H5, Vantage, Aligned/ODATA, NEXTDC, and STACK. A match enriches the existing row with specs PeeringDB does not publish — power, space, UPS, certifications — when the operator discloses them. Many do not: Equinix still publishes no MW. Unmatched pages (STACK campuses, some NEXTDC, H5, Vantage, and Aligned buildings) become new canonical facilities, not just overlays."
              url={null}
            />
            <Source
              name="Google and Meta location pages"
              count={fmt(hyperscale)}
              unit="buildings"
              what={`${fmt(stats.googleBuildings)} Google and ${fmt(stats.metaBuildings)} Meta buildings from their public location lists. Those pages give city and region, not a street pin — we geocode the city and keep the named building. Microsoft, AWS, and Apple buildings are not in the facility table yet; those clouds appear only as the region layer.`}
              url={null}
            />
            <Source
              name="Cloud provider region pages"
              count={fmt(stats.cloudRegions)}
              unit="regions"
              what="AWS, Google, Azure, Oracle. Tracked as a separate map layer, not in the facility table. A region is a logical grouping of buildings, not a building."
              url={null}
            />
          </div>
          <p className="mt-5 max-w-2xl text-sm text-zinc-500">
            No user submissions. We do not scrape directories whose terms forbid
            it (datacentermap.com, Cloudscene).
          </p>
        </section>

        <section className="mt-16">
          <SectionHeader>How we match and dedupe</SectionHeader>
          <div className="mt-5 max-w-2xl space-y-3 text-zinc-500">
            <p>
              Each canonical facility row can have many{" "}
              <em>source records</em> — one for every directory or page where we
              found that building. New sources are attached to an existing row
              before a new one is created.
            </p>
            <p>
              PeeringDB and OpenStreetMap use a two-step match: exact{" "}
              <code className="bg-teal-50 px-1 py-0.5 font-mono text-xs text-teal-900 dark:bg-teal-950/60 dark:text-teal-200">
                (operator, name)
              </code>
              , then any facility within{" "}
              <span className="font-mono tabular-nums text-teal-800 dark:text-teal-300">
                100m
              </span>
              . Unmatched OSM tags are inserted as new facilities.
            </p>
            <p>
              Operator pages and hyperscale buildings use a stricter matcher
              scoped to the same operator: exact name, then name prefix, then
              facility code. There is no spatial step — a 100m search was
              merging neighboring buildings of different operators. Equinix,
              Digital Realty, DataBank, Cologix, CoreSite, CyrusOne, and QTS
              pages that still miss are held as orphans for review. H5, Vantage,
              Aligned, NEXTDC, STACK, Iron Mountain, Google, and Meta pages that
              miss are inserted as new facilities.
            </p>
            <p>
              That is why an Equinix site known by three names across PeeringDB,
              OSM, and Equinix&rsquo;s own website is still one row, with three
              source records linked to it.
            </p>
          </div>
        </section>

        <section className="mt-16">
          <Link href="/about" className={sheetLink}>
            ← Back to About
          </Link>
        </section>

        <section className="mt-16 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
          <p>
            Data from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and operator-published
            facility pages · Map tiles by Mapbox ·{" "}
            <Link href="/privacy" className={sheetLink}>
              Privacy
            </Link>
          </p>
        </section>
    </EditorialShell>
  );
}
