import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase";
import { countryFlag, countryName } from "@/lib/countries";
import { InfoToggle } from "@/components/InfoToggle";
import { jsonForHtml } from "@/lib/json-ld";

const INFO: Record<string, string> = {
  "Power redundancy":
    "Power topology — N+1 means one spare unit beyond what's needed, so a single failure doesn't drop power. 2N means a fully duplicated chain.",
  "Cabinet density":
    "Maximum kilowatts each cabinet can draw. Higher densities mean you can pack more compute into less floor space, but require denser cooling.",
  "Uptime tier":
    "Uptime Institute classification. Tier I-IV measures redundancy and concurrent maintainability — Tier IV is fault-tolerant, Tier I is the baseline.",
  "Uptime SLA":
    "Contractual uptime guarantee. 99.999% (5 nines) ≈ 5 minutes downtime per year; 99.9999% ≈ 30 seconds.",
  "UPS redundancy":
    "Uninterruptible Power Supply topology. N+1 means there's one spare unit beyond what's needed, so a single failure doesn't drop power. 2N is a full duplicate.",
  "Generator redundancy":
    "Backup generator topology. Same N+1/2N semantics — describes how many spare gensets the facility runs.",
  "Generator autonomy":
    "How long the on-site generators can run at full load before refueling. Usually expressed in hours or days.",
  "Cooling redundancy":
    "Cooling infrastructure topology. N+1 means one spare cooling unit so a single failure doesn't take the floor offline.",
  PUE: "Power Usage Effectiveness — total facility power divided by IT power. 1.0 is theoretically perfect (all power goes to IT); industry average is around 1.5; hyperscalers approach 1.1.",
  "Meet-me rooms": "Dedicated interconnect rooms where carriers cross-connect to each other and to tenants.",
};

const SECTION_INFO = {
  ixes: "Internet Exchange Points hosted in this facility. Joining one connects you to dozens or hundreds of networks at once through a shared switch fabric.",
  networks:
    "Distinct ASNs (autonomous systems) with at least one port present at this facility. More networks means more interconnect options without leaving the building.",
};

type Props = {
  params: Promise<{ slug: string }>;
};

type SecurityBlock = {
  biometric?: boolean | null;
  mantrap?: boolean | null;
  ccvtv_24_7?: boolean | null;
  on_site_security?: string | null;
  features?: string[] | null;
};

type DataCenter = {
  id: string;
  slug: string;
  name: string;
  operator: string | null;
  code: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string;
  postal_code: string | null;
  lat: number;
  lng: number;
  status: string;
  power_mw: number | null;
  power_redundancy: string | null;
  power_distribution: string | null;
  space_sqft: number | null;
  space_sqm: number | null;
  raised_floor_sqft: number | null;
  site_acres: number | null;
  building_description: string | null;
  min_cabinet_density_kw: number | null;
  max_cabinet_density_kw: number | null;
  tier: string | null;
  uptime_sla: string | null;
  ups_redundancy: string | null;
  generator_redundancy: string | null;
  generator_autonomy: string | null;
  cooling: string | null;
  cooling_redundancy: string | null;
  year_built: number | null;
  year_opened: number | null;
  pue: number | null;
  meet_me_rooms: number | null;
  carriers: string[] | null;
  ixps: string[] | null;
  certifications: string[] | null;
  security: SecurityBlock | null;
  website: string | null;
  datasheet_url: string | null;
  verified: boolean;
};

type SourceRecord = {
  source: string;
  source_id: string;
  source_url: string | null;
  raw: unknown;
  fetched_at: string;
};

type NetworkAtFac = {
  local_asn: number | null;
  networks: {
    net_id: string;
    asn: number;
    name: string;
    website: string | null;
    info_type: string | null;
    info_scope: string | null;
    info_traffic: string | null;
    policy_general: string | null;
  } | null;
};

type IxAtFac = {
  ixes: {
    ix_id: string;
    name: string;
    name_long: string | null;
    country: string | null;
    website: string | null;
    net_count: number | null;
  } | null;
};

const STATUS_PIN_COLOR: Record<string, string> = {
  operational: "4ade80",
  under_construction: "fbbf24",
  planned: "94a3b8",
  decommissioned: "ef4444",
};

function buildSummary(args: {
  name: string;
  operator: string | null;
  city: string | null;
  country: string;
  power_mw: number | null;
  space_sqft: number | null;
  tier: string | null;
  networkCount?: number;
  ixCount?: number;
}): string {
  const where = [args.city, countryName(args.country)].filter(Boolean).join(", ");
  const op = args.operator ?? "an unknown operator";
  const specBits: string[] = [];
  if (args.power_mw) specBits.push(`${args.power_mw} MW`);
  if (args.space_sqft) specBits.push(`${args.space_sqft.toLocaleString()} sqft`);
  if (args.tier) specBits.push(`Tier ${args.tier}`);
  const specBlurb = specBits.length ? ` Published specs: ${specBits.join(" · ")}.` : "";
  const presenceBits: string[] = [];
  if (args.networkCount) presenceBits.push(`${args.networkCount.toLocaleString()} network${args.networkCount === 1 ? "" : "s"}`);
  if (args.ixCount) presenceBits.push(`${args.ixCount.toLocaleString()} Internet exchange${args.ixCount === 1 ? "" : "s"}`);
  const presenceBlurb = presenceBits.length ? ` Hosts ${presenceBits.join(" and ")}.` : "";
  return `${args.name} is a data center operated by ${op}${where ? ` in ${where}` : ""}.${specBlurb}${presenceBlurb}`;
}

export const revalidate = 604800;

const loadFacilityMeta = unstable_cache(
  async (slug: string) => {
    const sb = supabaseServer();
    const { data } = await sb
      .from("data_centers")
      .select("name, operator, code, city, country, power_mw, space_sqft, tier")
      .eq("slug", slug)
      .maybeSingle();
    return data;
  },
  ["facility-meta-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

const loadFacilityDetail = unstable_cache(
  async (slug: string) => {
    const sb = supabaseServer();
    const { data: dc, error } = await sb
      .from("data_centers")
      .select(
        "id, slug, name, operator, code, address, city, region, country, postal_code, lat, lng, status, power_mw, power_redundancy, power_distribution, space_sqft, space_sqm, raised_floor_sqft, site_acres, building_description, min_cabinet_density_kw, max_cabinet_density_kw, tier, uptime_sla, ups_redundancy, generator_redundancy, generator_autonomy, cooling, cooling_redundancy, year_built, year_opened, pue, meet_me_rooms, carriers, ixps, certifications, security, website, datasheet_url, verified",
      )
      .eq("slug", slug)
      .maybeSingle<DataCenter>();
    if (error) throw error;
    if (!dc) return null;

    const [{ data: sources }, { data: nafRows }, { data: iafRows }] = await Promise.all([
      sb
        .from("source_records")
        .select("source, source_id, source_url, raw, fetched_at")
        .eq("data_center_id", dc.id)
        .order("source")
        .returns<SourceRecord[]>(),
      sb
        .from("networks_at_facility")
        .select("local_asn, networks(net_id, asn, name, website, info_type, info_scope, info_traffic, policy_general)")
        .eq("data_center_id", dc.id)
        .limit(1000)
        .returns<NetworkAtFac[]>(),
      sb
        .from("ixes_at_facility")
        .select("ixes(ix_id, name, name_long, country, website, net_count)")
        .eq("data_center_id", dc.id)
        .limit(200)
        .returns<IxAtFac[]>(),
    ]);

    return { dc, sources: sources ?? [], nafRows: nafRows ?? [], iafRows: iafRows ?? [] };
  },
  ["facility-detail-v1"],
  { revalidate: 86_400, tags: ["data-centers"] },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadFacilityMeta(slug);
  if (!data) return { title: "Facility not found" };
  const op = data.operator ?? "Unknown operator";
  const title = `${data.name} · ${op}`;
  const description = buildSummary({
    name: data.name,
    operator: data.operator,
    city: data.city,
    country: data.country,
    power_mw: data.power_mw,
    space_sqft: data.space_sqft,
    tier: data.tier,
  });
  const canonical = `/facility/${slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function FacilityPage({ params }: Props) {
  const { slug } = await params;
  let payload;
  try {
    payload = await loadFacilityDetail(slug);
  } catch (e) {
    console.error("[facility]", e);
    notFound();
  }
  if (!payload) notFound();
  const { dc, sources, nafRows, iafRows } = payload;

  const networks = (nafRows ?? [])
    .map((r) => r.networks)
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const ixes = (iafRows ?? [])
    .map((r) => r.ixes)
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .sort((a, b) => (b.net_count ?? 0) - (a.net_count ?? 0));

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const pinColor = STATUS_PIN_COLOR[dc.status] ?? "4ade80";
  const mapImageUrl = token
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-l+${pinColor}(${dc.lng},${dc.lat})/${dc.lng},${dc.lat},10,0/600x300@2x?access_token=${token}`
    : null;

  const jsonLd = buildPlaceJsonLd(dc, networks.length, ixes.length);
  const faqJsonLd = buildFaqJsonLd(dc, networks.length, ixes, sources ?? []);

  return (
    <div
      className={`min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForHtml(jsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonForHtml(faqJsonLd) }}
        />
      )}
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            <ArrowLeftIcon /> Back to map
          </Link>
          <span className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
          <span>{dc.operator ?? "Unknown operator"}</span>
          {dc.code && (
            <span className="rounded bg-zinc-100 dark:bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
              {dc.code}
            </span>
          )}
          {dc.verified && <VerifiedBadge />}
        </div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{dc.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={dc.status} />
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="text-base leading-none">{countryFlag(dc.country)}</span>
            <span>
              {[dc.city, dc.region, countryName(dc.country)].filter(Boolean).join(", ")}
            </span>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          {buildSummary({
            name: dc.name,
            operator: dc.operator,
            city: dc.city,
            country: dc.country,
            power_mw: dc.power_mw,
            space_sqft: dc.space_sqft,
            tier: dc.tier,
            networkCount: networks.length,
            ixCount: ixes.length,
          })}
        </p>

        <section className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-5">
          <div className="md:col-span-3">
            <SpecBlock dc={dc} />

            {dc.security && <SecurityBlockView security={dc.security} />}

            {dc.address && (
              <div className="mt-6 rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40 p-5 text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
                  Address
                </div>
                <div className="mt-1 text-zinc-200">
                  {dc.address}
                  {dc.postal_code && <span className="text-zinc-400">, {dc.postal_code}</span>}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {dc.website && (
                <a
                  href={dc.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Operator website <ExternalLinkIcon />
                </a>
              )}
              {dc.datasheet_url && (
                <a
                  href={dc.datasheet_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Data sheet (PDF) <ExternalLinkIcon />
                </a>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
              Location
            </h2>
            {mapImageUrl ? (
              <Link
                href={`/?q=${dc.slug}`}
                className="block overflow-hidden rounded-2xl border border-zinc-800/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapImageUrl}
                  alt={`Map of ${dc.name}`}
                  width={600}
                  height={300}
                  className="aspect-[2/1] w-full bg-zinc-900 object-cover transition-opacity hover:opacity-90"
                />
              </Link>
            ) : (
              <div className="aspect-[2/1] w-full rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-900/40" />
            )}
            <div className="mt-3 text-xs tabular-nums text-zinc-900 dark:text-zinc-500">
              {dc.lat.toFixed(4)}, {dc.lng.toFixed(4)}
            </div>
          </div>
        </section>

        {ixes.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
              <span>Internet exchanges</span>
              <span className="text-zinc-600">({ixes.length})</span>
              <InfoToggle label="Internet exchanges" text={SECTION_INFO.ixes} />
            </h2>
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40 p-5">
              {ixes.map((ix) => (
                <a
                  key={ix.ix_id}
                  href={`https://www.peeringdb.com/ix/${ix.ix_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-800 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  title={ix.name_long ?? ix.name}
                >
                  <span>{ix.name}</span>
                  {ix.net_count != null && (
                    <span className="text-[10px] tabular-nums text-zinc-400 group-hover:text-zinc-300">
                      {ix.net_count}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {networks.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
              <span>Networks present</span>
              <span className="text-zinc-600">({networks.length})</span>
              <InfoToggle label="Networks present" text={SECTION_INFO.networks} />
            </h2>
            <div className="rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40 p-5">
              <div className="flex flex-wrap gap-1.5">
                {networks.map((n) => (
                  <a
                    key={n.net_id}
                    href={`https://www.peeringdb.com/net/${n.net_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800/70 px-2 py-0.5 text-xs text-zinc-800 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    title={`${n.name} (AS${n.asn})${n.info_type ? ` · ${n.info_type}` : ""}${n.policy_general ? ` · ${n.policy_general} peering` : ""}`}
                  >
                    <span className="font-mono text-[10px] tabular-nums text-zinc-400 group-hover:text-zinc-300">
                      AS{n.asn}
                    </span>
                    <span className="max-w-[160px] truncate">{n.name}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {(dc.carriers?.length || dc.certifications?.length) && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
              Carriers & certs
            </h2>
            <div className="space-y-4 rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40 p-5">
              {dc.carriers?.length ? (
                <TagList label="Carriers" items={dc.carriers} />
              ) : null}
              {dc.certifications?.length ? (
                <TagList label="Certifications" items={dc.certifications} />
              ) : null}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
            Sources <span className="text-zinc-600">({sources?.length ?? 0})</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {sources?.length ? (
              <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800/60">
                {sources.map((s) => (
                  <li
                    key={`${s.source}::${s.source_id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <SourceBadge source={s.source} />
                      {s.source_url ? (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {s.source_id}
                          <ExternalLinkIcon />
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-zinc-900 dark:text-zinc-500">{s.source_id}</span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-900 dark:text-zinc-500">
                      fetched{" "}
                      {new Date(s.fetched_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center text-sm text-zinc-900 dark:text-zinc-500">
                No source records linked to this facility.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Detail({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">
        <span>{label}</span>
        {info && <InfoToggle label={label} text={info} />}
      </dt>
      <dd className="mt-0.5 text-zinc-900 tabular-nums dark:text-zinc-100">{value}</dd>
    </div>
  );
}

function SpecBlock({ dc }: { dc: DataCenter }) {
  const rows: Array<[string, string | null]> = [
    ["Power capacity", fmtPower(dc.power_mw)],
    ["Power redundancy", dc.power_redundancy],
    ["Power distribution", dc.power_distribution],
    ["Total space", fmtSpace(dc.space_sqft, dc.space_sqm)],
    ["Raised floor", dc.raised_floor_sqft ? `${dc.raised_floor_sqft.toLocaleString()} sqft` : null],
    ["Site area", dc.site_acres ? `${dc.site_acres} acres` : null],
    ["Building", dc.building_description],
    ["Cabinet density", fmtCabinetRange(dc.min_cabinet_density_kw, dc.max_cabinet_density_kw)],
    ["Year built", fmtYear(dc.year_opened, dc.year_built)],
    ["Uptime tier", dc.tier],
    ["Uptime SLA", dc.uptime_sla],
    ["UPS redundancy", dc.ups_redundancy],
    ["Generator redundancy", dc.generator_redundancy],
    ["Generator autonomy", dc.generator_autonomy],
    ["Cooling", dc.cooling],
    ["Cooling redundancy", dc.cooling_redundancy],
    ["PUE", dc.pue?.toString() ?? null],
    ["Meet-me rooms", dc.meet_me_rooms?.toString() ?? null],
  ];
  const visible = rows.filter(([, v]) => v != null && v !== "");

  return (
    <>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">Specs</h2>
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-5 text-sm text-zinc-900 dark:text-zinc-500">
          No published specs for this facility.
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40 p-5 text-sm">
          {visible.map(([label, value]) => (
            <Detail key={label} label={label} value={value as string} info={INFO[label]} />
          ))}
        </dl>
      )}
    </>
  );
}

function SecurityBlockView({ security }: { security: SecurityBlock }) {
  const features = security.features?.filter(Boolean) ?? [];
  const flags: Array<[string, boolean]> = [
    ["Biometric access", security.biometric === true],
    ["Mantrap", security.mantrap === true],
    ["24/7 CCTV", security.ccvtv_24_7 === true],
  ];
  const visibleFlags = flags.filter(([, on]) => on);
  if (features.length === 0 && visibleFlags.length === 0 && !security.on_site_security) return null;

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40 p-5 text-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">Security</div>
      {visibleFlags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleFlags.map(([label]) => (
            <span
              key={label}
              className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-emerald-500/30"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {features.length > 0 && (
        <ul className="mt-3 space-y-1 text-zinc-200">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-zinc-600">•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildPlaceJsonLd(dc: DataCenter, networkCount: number, ixCount: number) {
  const props: Array<{ "@type": "PropertyValue"; name: string; value: string | number; unitText?: string }> = [];
  const push = (name: string, value: string | number | null | undefined, unitText?: string) => {
    if (value == null || value === "") return;
    const entry: { "@type": "PropertyValue"; name: string; value: string | number; unitText?: string } = {
      "@type": "PropertyValue",
      name,
      value,
    };
    if (unitText) entry.unitText = unitText;
    props.push(entry);
  };
  push("Facility code", dc.code);
  push("Power capacity", dc.power_mw, "MW");
  push("Power redundancy", dc.power_redundancy);
  push("Total space", dc.space_sqft, "sqft");
  push("Raised floor", dc.raised_floor_sqft, "sqft");
  push("Site area", dc.site_acres, "acres");
  push("Min cabinet density", dc.min_cabinet_density_kw, "kW");
  push("Max cabinet density", dc.max_cabinet_density_kw, "kW");
  push("Uptime tier", dc.tier);
  push("Uptime SLA", dc.uptime_sla);
  push("UPS redundancy", dc.ups_redundancy);
  push("Generator redundancy", dc.generator_redundancy);
  push("Cooling", dc.cooling);
  push("PUE", dc.pue);
  push("Year built", dc.year_opened ?? dc.year_built);
  if (networkCount > 0) push("Networks present", networkCount);
  if (ixCount > 0) push("Internet exchanges", ixCount);

  const address = {
    "@type": "PostalAddress",
    streetAddress: dc.address ?? undefined,
    addressLocality: dc.city ?? undefined,
    addressRegion: dc.region ?? undefined,
    postalCode: dc.postal_code ?? undefined,
    addressCountry: dc.country,
  };

  return {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": `/facility/${dc.slug}`,
    name: dc.name,
    url: `/facility/${dc.slug}`,
    description: `${dc.name}${dc.operator ? `, a data center operated by ${dc.operator}` : ""}${
      dc.city || dc.country ? ` in ${[dc.city, countryName(dc.country)].filter(Boolean).join(", ")}` : ""
    }.`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: dc.lat,
      longitude: dc.lng,
    },
    address,
    isAccessibleForFree: true,
    publicAccess: false,
    additionalType: "https://en.wikipedia.org/wiki/Data_center",
    additionalProperty: props,
    ...(dc.operator
      ? {
          subjectOf: {
            "@type": "Organization",
            name: dc.operator,
            url: dc.website ?? undefined,
          },
        }
      : {}),
    sameAs: dc.website ? [dc.website] : undefined,
  };
}

function buildFaqJsonLd(
  dc: DataCenter,
  networkCount: number,
  ixes: Array<{ ix_id: string; name: string }>,
  sources: SourceRecord[],
) {
  type Ix = { name: string };
  const qa: Array<{ q: string; a: string }> = [];
  const where = [dc.city, countryName(dc.country)].filter(Boolean).join(", ");

  // Location — always present (we have country at minimum)
  if (dc.address || where) {
    const locParts = [dc.address, where].filter(Boolean).join(", ");
    qa.push({
      q: `Where is ${dc.name} located?`,
      a: `${dc.name} is located at ${locParts}.`,
    });
  }

  if (dc.operator) {
    qa.push({
      q: `Who operates ${dc.name}?`,
      a: `${dc.name} is operated by ${dc.operator}.`,
    });
  }

  qa.push({
    q: `What is the status of ${dc.name}?`,
    a: dc.status === "operational"
      ? `${dc.name} is operational.`
      : dc.status === "under_construction"
        ? `${dc.name} is under construction.`
        : dc.status === "planned"
          ? `${dc.name} is planned but not yet operational.`
          : `${dc.name} has been decommissioned.`,
  });

  if (dc.power_mw) {
    qa.push({
      q: `What is the power capacity of ${dc.name}?`,
      a: `${dc.name} has a published power capacity of ${dc.power_mw} MW${dc.power_redundancy ? ` with ${dc.power_redundancy} redundancy` : ""}.`,
    });
  }

  if (dc.space_sqft || dc.space_sqm) {
    const space = dc.space_sqft
      ? `${dc.space_sqft.toLocaleString()} square feet${dc.space_sqm ? ` (${dc.space_sqm.toLocaleString()} sqm)` : ""}`
      : `${dc.space_sqm!.toLocaleString()} square meters`;
    qa.push({
      q: `How large is ${dc.name}?`,
      a: `${dc.name} has ${space} of facility space.`,
    });
  }

  if (dc.tier) {
    qa.push({
      q: `What Uptime tier is ${dc.name}?`,
      a: `${dc.name} is rated to Uptime Institute Tier ${dc.tier} standards.`,
    });
  }

  if (networkCount > 0) {
    qa.push({
      q: `How many networks are present at ${dc.name}?`,
      a: `${networkCount.toLocaleString()} network${networkCount === 1 ? " is" : "s are"} present at ${dc.name} according to PeeringDB, including carriers, ISPs, and content networks.`,
    });
  }

  if (ixes.length > 0) {
    const named = ixes.slice(0, 3).map((x: Ix) => x.name).join(", ");
    qa.push({
      q: `What Internet exchanges does ${dc.name} host?`,
      a: `${dc.name} hosts ${ixes.length} Internet exchange${ixes.length === 1 ? "" : "s"}${named ? `, including ${named}` : ""}.`,
    });
  }

  if (dc.certifications && dc.certifications.length > 0) {
    qa.push({
      q: `What certifications does ${dc.name} hold?`,
      a: `${dc.name} holds the following published certifications: ${dc.certifications.join(", ")}.`,
    });
  }

  if (sources.length > 0) {
    const sourceLabels = [
      ...new Set(sources.map((s) => SOURCE_LABEL[s.source] ?? s.source)),
    ].join(", ");
    qa.push({
      q: `Where does the data on ${dc.name} come from?`,
      a: `Information about ${dc.name} is aggregated from ${sources.length} source${sources.length === 1 ? "" : "s"}: ${sourceLabels}. Each source record is linked at the bottom of the page.`,
    });
  }

  if (qa.length < 3) return null; // Don't ship a near-empty FAQPage.

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `/facility/${dc.slug}#faq`,
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

function TagList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-900 dark:text-zinc-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-full bg-zinc-100 dark:bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-800 dark:text-zinc-200"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "operational"
      ? "bg-green-500/15 text-green-300 ring-green-500/30"
      : status === "under_construction"
        ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
        : status === "planned"
          ? "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30"
          : "bg-red-500/15 text-red-300 ring-red-500/30";
  const label = status === "under_construction" ? "Under construction" : status[0].toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  peeringdb: "PeeringDB",
  osm: "OpenStreetMap",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  oracle: "Oracle Cloud",
  "equinix-com": "Equinix",
  "digitalrealty-com": "Digital Realty",
  "databank-com": "DataBank",
  "cologix-com": "Cologix",
  "coresite-com": "CoreSite",
  "cyrusone-com": "CyrusOne",
  "qtsdatacenters-com": "QTS",
  "ironmountain-com": "Iron Mountain",
};

const OPERATOR_BADGE = "bg-amber-500/15 text-amber-300 ring-amber-500/30";

const SOURCE_COLOR: Record<string, string> = {
  peeringdb: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  osm: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  aws: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  gcp: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  azure: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  oracle: "bg-red-500/15 text-red-300 ring-red-500/30",
  "equinix-com": OPERATOR_BADGE,
  "digitalrealty-com": OPERATOR_BADGE,
  "databank-com": OPERATOR_BADGE,
  "cologix-com": OPERATOR_BADGE,
  "coresite-com": OPERATOR_BADGE,
  "cyrusone-com": OPERATOR_BADGE,
  "qtsdatacenters-com": OPERATOR_BADGE,
  "ironmountain-com": OPERATOR_BADGE,
};

function SourceBadge({ source }: { source: string }) {
  const cls = SOURCE_COLOR[source] ?? "bg-zinc-700 text-zinc-300 ring-zinc-700";
  const label = SOURCE_LABEL[source] ?? source;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-blue-500/30">
      <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
        <path d="M12 2 4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5l-8-3z" />
      </svg>
      Verified
    </span>
  );
}

function fmtPower(mw: number | null): string | null {
  if (mw == null) return null;
  return `${mw} MW`;
}

function fmtSpace(sqft: number | null, sqm: number | null): string | null {
  if (sqft != null) {
    return sqm != null
      ? `${sqft.toLocaleString()} sqft / ${sqm.toLocaleString()} sqm`
      : `${sqft.toLocaleString()} sqft`;
  }
  if (sqm != null) return `${sqm.toLocaleString()} sqm`;
  return null;
}

function fmtCabinetRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} kW / cabinet`;
  return `${min ?? max} kW / cabinet`;
}

function fmtYear(opened: number | null, built: number | null): string | null {
  const y = opened ?? built;
  return y ? y.toString() : null;
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7M19 12H5" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
    </svg>
  );
}

