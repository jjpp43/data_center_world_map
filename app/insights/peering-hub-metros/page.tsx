import Link from "next/link";
import type { Metadata } from "next";
import { countryFlag, countryName } from "@/lib/countries";
import { METROS, assignMetro } from "@/lib/metros-data";
import { supabaseServer } from "@/lib/supabase";
import { getTheme } from "@/lib/theme";

export const revalidate = 86400;

const TOP_N = 20;

export const metadata: Metadata = {
  title: "Where the world peers: metros ranked by network density",
  description:
    "Frankfurt vs. Ashburn vs. Singapore vs. Tokyo — colocation metros ranked by aggregate peering-network presence. The actual numbers behind the world's biggest peering hubs.",
  alternates: { canonical: "/insights/peering-hub-metros" },
  openGraph: {
    title: "Where the world peers: metros ranked by network density",
    description: "Colocation metros ranked by aggregate peering presence.",
    type: "article",
    url: "/insights/peering-hub-metros",
  },
};

export default async function PeeringHubMetrosInsight() {
  const sb = supabaseServer();
  const rows: Array<{
    country: string;
    lat: number;
    lng: number;
    network_count: number;
    ix_count: number;
  }> = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await sb
      .from("data_centers")
      .select("country, lat, lng, networks_at_facility(count), ixes_at_facility(count)")
      .neq("status", "decommissioned")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("slug")
      .range(from, from + 999)
      .returns<
        Array<{
          country: string;
          lat: number;
          lng: number;
          networks_at_facility: Array<{ count: number }> | null;
          ixes_at_facility: Array<{ count: number }> | null;
        }>
      >();
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(
      ...data.map((r) => ({
        country: r.country,
        lat: r.lat,
        lng: r.lng,
        network_count: r.networks_at_facility?.[0]?.count ?? 0,
        ix_count: r.ixes_at_facility?.[0]?.count ?? 0,
      })),
    );
    if (data.length < 1000) break;
  }

  const agg = new Map<
    string,
    { facility_count: number; networks: number; ix_present: number }
  >();
  for (const f of rows) {
    const m = assignMetro(f.lat, f.lng, f.country);
    if (!m) continue;
    const cur = agg.get(m.slug) ?? { facility_count: 0, networks: 0, ix_present: 0 };
    cur.facility_count += 1;
    cur.networks += f.network_count;
    if (f.ix_count > 0) cur.ix_present += 1;
    agg.set(m.slug, cur);
  }

  const ranked = METROS
    .map((m) => {
      const a = agg.get(m.slug);
      return {
        ...m,
        facility_count: a?.facility_count ?? 0,
        networks: a?.networks ?? 0,
        ix_present: a?.ix_present ?? 0,
      };
    })
    .filter((m) => m.facility_count > 0)
    .sort((a, b) => b.networks - a.networks)
    .slice(0, TOP_N);

  const totalNetworks = ranked.reduce((s, m) => s + m.networks, 0);
  const lead = ranked[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Where the world peers: metros ranked by network density",
    description: "Colocation metros ranked by aggregate peering-network presence.",
    author: { "@type": "Person", name: "Junna Park" },
    isPartOf: { "@type": "WebSite", name: "datacenters.world", url: "https://datacenters.world/" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: ranked.length,
      itemListElement: ranked.map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `/metros/${m.slug}`,
        name: m.name,
      })),
    },
  };

  const theme = await getTheme();
  return (
    <div className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/insights" className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            ← Insights
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
          Metros
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Where the world peers
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          You hear &ldquo;Frankfurt is the largest peering hub in Europe&rdquo; or &ldquo;Ashburn is
          the world&rsquo;s biggest&rdquo; — but the actual ranking depends on what you measure.
          This one uses aggregate PeeringDB network presence across every tracked facility in the
          metro. The top 20 metros together host{" "}
          <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
            {totalNetworks.toLocaleString()}
          </span>{" "}
          network presences.
        </p>
        {lead && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
            #1 is{" "}
            <Link href={`/metros/${lead.slug}`} className="text-zinc-900 hover:underline dark:text-zinc-100">
              {lead.name}
            </Link>{" "}
            with{" "}
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {lead.networks.toLocaleString()}
            </span>{" "}
            network presences spread across{" "}
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {lead.facility_count}
            </span>{" "}
            facilities.
          </p>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Ranking
          </h2>
          <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {ranked.map((m, i) => (
              <li key={m.slug} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 font-mono text-[10px] tabular-nums text-zinc-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-base leading-none">{countryFlag(m.country)}</span>
                  <Link
                    href={`/metros/${m.slug}`}
                    className="truncate text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {m.name}
                  </Link>
                  <span className="hidden text-xs text-zinc-500 sm:inline">
                    {countryName(m.country)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {m.networks.toLocaleString()} networks
                  </span>
                  <span className="text-zinc-500">{m.facility_count} fac</span>
                  {m.ix_present > 0 && (
                    <span className="text-zinc-500">{m.ix_present} w/ IXP</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-zinc-500">
          &ldquo;Network presence&rdquo; sums each network counted at each facility — so a network
          peering at five Frankfurt buildings adds five to Frankfurt&rsquo;s total. The headline
          alternative is unique-network count per metro, which favors broader-distribution metros
          over deep-concentration ones. This ranking captures interconnect <em>weight</em>, not
          unique reach.
        </p>

        <div className="mt-12 text-xs text-zinc-500">
          <Link href="/insights" className="hover:underline">
            ← All insights
          </Link>
        </div>
      </main>
    </div>
  );
}
