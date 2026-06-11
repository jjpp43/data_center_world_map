import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHeader, SectionHeader } from "@/components/editorial";
import { getTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "API",
  description:
    "Public, free, no-auth read API for the datacenters.world atlas. JSON or CSV, open CORS, designed to be cited by humans and answer engines alike.",
  alternates: { canonical: "/api" },
  openGraph: {
    title: "datacenters.world API",
    description:
      "Public, free, no-auth read API for the datacenters.world atlas — 5,351 facilities, 34,732 networks, 1,309 IXPs.",
    type: "article",
    url: "/api",
  },
};

const BASE = "https://datacenters.world/api/v1";

export default async function ApiDocsPage() {
  const theme = await getTheme();

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
    >
      <EditorialHeader active="api" />

      <main className="relative mx-auto max-w-5xl px-6 py-12">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
        />

        <div className="max-w-3xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            v1 · free tier available · bearer-token auth required
          </div>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            API.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            Read access to every data center, operator, country, and cloud region in the atlas.
            JSON or CSV, open CORS, edge-cached. Every request needs an API key —{" "}
            <Link href="/dashboard/keys" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
              create a free one
            </Link>{" "}
            (no card) and you&rsquo;re in.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Pill label="Base URL" value="/api/v1" />
            <Pill label="Auth" value="bearer (required)" />
            <Pill label="Formats" value="json · csv" />
            <Pill label="CORS" value="open (any origin)" />
          </div>
        </div>

        <section className="mt-16">
          <SectionHeader number={1}>Quick start</SectionHeader>
          <div className="mt-5">
            <Code
              label="List the 5 largest German facilities by Equinix"
              content={`curl '${BASE}/facilities?country=DE&operator=Equinix&limit=5' \\
     -H 'Authorization: Bearer dcw_…'`}
            />
          </div>
          <p className="mt-3 max-w-2xl text-sm text-zinc-500">
            Get your key at{" "}
            <Link href="/dashboard/keys" className="text-blue-600 hover:underline dark:text-blue-400">
              /dashboard/keys
            </Link>
            . Free tier is 500 requests/month — no card required.
          </p>
        </section>

        <section className="mt-16">
          <SectionHeader number={2}>Endpoints</SectionHeader>

          <Endpoint
            method="GET"
            path="/api/v1/facilities"
            description="Paginated list of data centers. The workhorse endpoint."
            params={[
              ["country", "ISO-3166-1 alpha-2 codes, comma-separated", "country=DE,FR"],
              [
                "operator",
                "Operator name. Single value uses prefix match; multiple values use exact match.",
                "operator=Equinix",
              ],
              ["min_power_mw", "Minimum published power capacity (MW)", "min_power_mw=10"],
              ["status", "operational | under_construction | planned", "status=operational"],
              ["limit", "1–500, default 50", "limit=100"],
              ["offset", "0+, default 0", "offset=100"],
              ["format", "json (default) or csv", "format=csv"],
            ]}
            example={`curl '${BASE}/facilities?country=US&limit=2'`}
            response={`{
  "data": [
    {
      "slug": "equinix-inc-equinix-dc1-...",
      "name": "Equinix DC1-DC15,DC21-DC22 - Ashburn",
      "operator": "Equinix, Inc.",
      "code": null,
      "city": "Ashburn",
      "country": "US",
      "lat": 39.018593,
      "lng": -77.539233,
      "status": "operational",
      "power_mw": null,
      "space_sqft": null,
      "ups_redundancy": null,
      "uptime_sla": null,
      "network_count": 504,
      "ix_count": 7
    }
  ],
  "meta": {
    "total": 1372,
    "returned": 2,
    "limit": 2,
    "offset": 0,
    "next_offset": 2
  }
}`}
          />

          <Endpoint
            method="GET"
            path="/api/v1/facilities/{slug}"
            description="Full record for a single facility — specs, networks, IXPs, and source records (with provenance URLs)."
            example={`curl '${BASE}/facilities/equinix-inc-equinix-ny2-ny4-ny5-ny6-new-york-secaucus-secaucus'`}
            response={`{
  "data": {
    "slug": "equinix-inc-equinix-ny2-...",
    "name": "Equinix NY2/NY4/NY5/NY6 - New York, Secaucus",
    "operator": "Equinix, Inc.",
    "power_mw": null,
    "space_sqft": 129436,
    "tier": null,
    "uptime_sla": "99.9999%+",
    "ups_redundancy": "N+1",
    "certifications": ["FISMA", "HIPAA", "ISO 27001", ...],
    "networks": [ /* 129 ASNs with name, AS#, policy */ ],
    "ixes":     [ /* 10 internet exchanges */ ],
    "sources":  [ /* 5 source records with URLs + fetched_at */ ],
    "network_count": 129,
    "ix_count": 10
  }
}`}
          />

          <Endpoint
            method="GET"
            path="/api/v1/operators"
            description="Operators ranked by facility count, with country breadth."
            params={[
              ["country", "Restrict to operators present in these countries", "country=DE,FR"],
              ["min_facilities", "Minimum facility count", "min_facilities=5"],
              ["limit", "1–1000, default 100", "limit=20"],
              ["format", "json or csv", "format=csv"],
            ]}
            example={`curl '${BASE}/operators?limit=5'`}
            response={`{
  "data": [
    { "operator": "Equinix, Inc.",   "facility_count": 213, "country_count": 35 },
    { "operator": "Digital Realty",  "facility_count": 140, "country_count": 22 },
    { "operator": "DataBank, Ltd.",  "facility_count":  63, "country_count":  2 },
    { "operator": "Cogent Communications, Inc.", "facility_count": 55, "country_count": 7 },
    { "operator": "EXA Infrastructure", "facility_count": 53, "country_count": 11 }
  ],
  "meta": { "total": 5 }
}`}
          />

          <Endpoint
            method="GET"
            path="/api/v1/countries"
            description="All countries with at least one facility, ranked by count."
            params={[["format", "json or csv", "format=csv"]]}
            example={`curl '${BASE}/countries?format=csv' -o countries.csv`}
            response={`{
  "data": [
    { "country": "US", "country_name": "United States", "facility_count": 1372 },
    { "country": "DE", "country_name": "Germany",        "facility_count":  359 },
    { "country": "BR", "country_name": "Brazil",         "facility_count":  303 }
  ],
  "meta": { "total": 148 }
}`}
          />

          <Endpoint
            method="GET"
            path="/api/v1/cloud-regions"
            description="All public cloud regions across AWS, GCP, Azure, and Oracle."
            params={[
              ["provider", "aws | gcp | azure | oracle, comma-separated", "provider=aws,gcp"],
              ["country", "ISO-3166-1 alpha-2 codes", "country=DE"],
              ["format", "json or csv", "format=csv"],
            ]}
            example={`curl '${BASE}/cloud-regions?provider=aws&country=DE'`}
            response={`{
  "data": [
    {
      "provider": "aws",
      "code": "eu-central-1",
      "name": "Europe (Frankfurt)",
      "city": "Frankfurt",
      "country": "DE",
      "lat": 50.1109,
      "lng": 8.6821,
      "launched_year": 2014
    }
  ],
  "meta": { "total": 1 }
}`}
          />
        </section>

        <section className="mt-16">
          <SectionHeader number={3}>Conventions</SectionHeader>
          <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
            <Convention title="Response envelope">
              All JSON responses are{" "}
              <Inline>{`{ data, meta }`}</Inline>. <Inline>data</Inline> is the result; <Inline>meta</Inline>{" "}
              carries pagination and totals.
            </Convention>
            <Convention title="Errors">
              Non-2xx responses use{" "}
              <Inline>{`{ "error": { "message", "status" } }`}</Inline>.
            </Convention>
            <Convention title="Pagination">
              Pass <Inline>limit</Inline> + <Inline>offset</Inline>. The response includes{" "}
              <Inline>meta.next_offset</Inline> (or <Inline>null</Inline> when exhausted).
            </Convention>
            <Convention title="Caching">
              Lists: 5-minute edge cache. Details &amp; aggregates: 1-hour. All responses use{" "}
              <Inline>stale-while-revalidate</Inline>.
            </Convention>
            <Convention title="CSV exports">
              Append <Inline>?format=csv</Inline>. Nested fields are serialized to JSON inside their
              cell.
            </Convention>
            <Convention title="CORS">
              Open to any origin. No preflight required for plain GETs without custom headers.
            </Convention>
          </div>
        </section>

        <section className="mt-16">
          <SectionHeader number={4}>Authentication</SectionHeader>
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            Every request needs an API key passed in the{" "}
            <Inline>Authorization</Inline> header. Sign in with GitHub at{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
              /login
            </Link>
            , then create a key from the{" "}
            <Link href="/dashboard/keys" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
              dashboard
            </Link>
            . Free tier is 500 requests/month, no card required. Unauthenticated requests get{" "}
            <Inline>401 Unauthorized</Inline>.
          </p>
          <Code
            label="Authenticated request"
            content={`curl '${BASE}/facilities?country=DE&limit=5' \\
     -H 'Authorization: Bearer dcw_…'`}
          />
          <p className="mt-4 max-w-2xl text-sm text-zinc-500">
            Every response sets <Inline>X-RateLimit-Tier</Inline>,{" "}
            <Inline>X-RateLimit-Limit</Inline>, and <Inline>X-RateLimit-Remaining</Inline>. When you
            exceed the quota, the API returns <Inline>429 Too Many Requests</Inline> with a JSON
            error body. Keys are sha256-hashed at rest; we never store the plaintext.
          </p>
        </section>

        <section className="mt-16">
          <SectionHeader number={5}>Pricing</SectionHeader>
          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/40 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200/70 bg-zinc-50/60 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-900/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Tier</th>
                  <th className="px-4 py-2.5 text-left font-medium">Quota</th>
                  <th className="px-4 py-2.5 text-left font-medium">Price</th>
                  <th className="px-4 py-2.5 text-left font-medium">For</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                <PricingRow tier="Free" quota="500 / month" price="$0" forWho="Hobbyists, evaluation, indie tools." />
                <PricingRow tier="Pro" quota="10,000 / month" price="$10.99 / mo" forWho="Production services, dashboards, internal tools." />
                <PricingRow tier="Team" quota="50,000 / month" price="$49.99 / mo" forWho="Bulk analytics, market research, embedded data." />
                <PricingRow tier="Enterprise" quota="custom" price="contact" forWho="SLA, custom exports, on-prem mirror." />
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-zinc-500">
            Pro and Team subscriptions ship via Polar.sh. Upgrades take effect immediately and
            every active key under your account inherits the new tier — no key rotation or
            migration. Manage from{" "}
            <Link href="/dashboard/billing" className="text-blue-600 hover:underline dark:text-blue-400">
              /dashboard/billing
            </Link>
            .
          </p>
        </section>

        <section className="mt-16">
          <SectionHeader number={6}>Versioning and stability</SectionHeader>
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            All endpoints live under <Inline>/api/v1/</Inline>. Breaking changes ship under a new
            major (<Inline>/api/v2/</Inline>) — never inside <Inline>v1</Inline>. Additive changes
            (new optional query params, new response fields) ship without version bump.
          </p>
        </section>

        <section className="mt-16">
          <SectionHeader number={7}>Roadmap (post-v1)</SectionHeader>
          <ul className="mt-5 max-w-2xl space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Paid tier checkout</strong> —
              Pro and Team subscriptions via Polar.sh, with the same key flipping in place.
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">More filters</strong> —{" "}
              <Inline>min_networks</Inline>, <Inline>has_pue</Inline>, geospatial{" "}
              <Inline>near=lat,lng&amp;radius_km=</Inline>.
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">Search</strong> —{" "}
              <Inline>/api/v1/search?q=</Inline> backed by Postgres full-text + trigrams.
            </li>
            <li>
              <strong className="text-zinc-900 dark:text-zinc-100">OpenAPI spec</strong> at{" "}
              <Inline>/api/v1/openapi.json</Inline> once the surface stabilizes.
            </li>
          </ul>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <SectionHeader number={8}>Get in touch</SectionHeader>
            <p className="mt-5 max-w-xl text-zinc-600 dark:text-zinc-300">
              Building something with this? Tell us — we&rsquo;ll prioritize the filters and exports
              you need. Need higher limits, an SLA, or a one-off bulk export today? Get in touch.
            </p>
          </div>
          <Link
            href="/methodology"
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Methodology <span aria-hidden>→</span>
          </Link>
        </section>

        <section className="mt-16 border-t border-zinc-200/70 pt-6 text-xs text-zinc-500 dark:border-zinc-800/60">
          <p className="font-mono">
            Data from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), and operator-published facility
            pages · Citing the API is appreciated · No usage analytics
          </p>
        </section>
      </main>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200/70 bg-white/60 px-3 py-2 dark:border-zinc-800/70 dark:bg-zinc-900/30">
      <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function Endpoint({
  method,
  path,
  description,
  params,
  example,
  response,
}: {
  method: string;
  path: string;
  description: string;
  params?: Array<[string, string, string]>;
  example: string;
  response: string;
}) {
  return (
    <article className="mt-8 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/40 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-900/30">
      <header className="flex flex-wrap items-baseline gap-3 border-b border-zinc-200/60 px-5 py-3 dark:border-zinc-800/60">
        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-emerald-700 dark:text-emerald-300">
          {method}
        </span>
        <code className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{path}</code>
        <span className="text-sm text-zinc-500">— {description}</span>
      </header>

      {params && params.length > 0 && (
        <div className="px-5 py-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            Query params
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
              {params.map(([name, desc, ex]) => (
                <tr key={name}>
                  <td className="py-1.5 pr-3 align-top font-mono text-xs text-zinc-900 dark:text-zinc-100">
                    {name}
                  </td>
                  <td className="py-1.5 pr-3 align-top text-zinc-600 dark:text-zinc-400">{desc}</td>
                  <td className="py-1.5 align-top font-mono text-[11px] text-zinc-500">
                    {ex}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-3">
        <Code label="Example" content={example} />
        <Code label="Response (truncated)" content={response} className="mt-3" />
      </div>
    </article>
  );
}

function Code({
  label,
  content,
  className = "",
}: {
  label: string;
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-zinc-200/70 bg-zinc-50/80 p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:text-zinc-200">
        {content}
      </pre>
    </div>
  );
}

function Convention({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      {children}
    </code>
  );
}

function PricingRow({
  tier,
  quota,
  price,
  forWho,
}: {
  tier: string;
  quota: string;
  price: string;
  forWho: string;
}) {
  return (
    <tr className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
      <td className="px-4 py-3 align-top font-medium text-zinc-900 dark:text-zinc-100">{tier}</td>
      <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
        {quota}
      </td>
      <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
        {price}
      </td>
      <td className="px-4 py-3 align-top text-sm text-zinc-600 dark:text-zinc-400">{forWho}</td>
    </tr>
  );
}
