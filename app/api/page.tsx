import type { Metadata } from "next";
import Link from "next/link";
import { EditorialShell, sheetLink } from "@/components/editorial";
import { ApiNav } from "./ApiNav";
import { CodeTabs, ResponseBlock, Snippet } from "./CodeTabs";

export const revalidate = 2_592_000;

export const metadata: Metadata = {
  title: "API",
  description:
    "REST + MCP access to the datacenters.world atlas — 5,675 facilities, 34,732 networks, 1,309 IXPs, 176 cloud regions. JSON or CSV, open CORS, edge-cached. Plug into Claude Desktop, Cursor, or Claude Code via MCP, or call /api/v1 from anywhere. Free tier 1,000 req/month.",
  alternates: { canonical: "/api" },
  openGraph: {
    title: "datacenters.world API",
    description:
      "REST + MCP access to the datacenters.world atlas — 5,675 facilities, 34,732 networks, 1,309 IXPs, 176 cloud regions.",
    type: "article",
    url: "/api",
  },
};

const BASE = "https://datacenters.world/api/v1";

export default async function ApiDocsPage() {

  return (
    <EditorialShell active="api" wide>
        <h1 className="text-3xl font-semibold tracking-tight">API Reference</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
            Read access to every data center, operator, country, and cloud region in the atlas.
            JSON or CSV, open CORS, edge-cached. Every request needs an API key —{" "}
            <Link href="/dashboard" className={sheetLink}>
              create a free one
            </Link>{" "}
            (no card) and you&rsquo;re in.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Pill label="Base URL" value="/api/v1" />
            <Pill label="Auth" value="bearer (required)" />
            <Pill label="Formats" value="json · csv" />
            <Pill label="CORS" value="open" />
          </div>

        {/* Mobile TOC */}
        <details className="mt-10 rounded-lg border border-zinc-200 px-4 py-3 lg:hidden dark:border-zinc-800">
          <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-300">
            On this page
          </summary>
          <div className="mt-3">
            <ApiNav />
          </div>
        </details>

        {/* Grid: left sidebar + content */}
        <div className="mt-10 grid gap-x-12 gap-y-16 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8">
              <ApiNav />
            </div>
          </aside>

          <article className="min-w-0 space-y-16">
            {/* ─────────── Overview ─────────── */}
            <Section id="overview" number={1} title="Overview">
              <p className="mt-5 max-w-2xl text-zinc-500">
                The datacenters.world API is a read-only REST interface over the same dataset that
                powers the public map and editorial pages.
              </p>
              <ul className="mt-4 max-w-2xl space-y-2 text-base text-zinc-500">
                <li>
                  <strong className="font-mono text-zinc-900 dark:text-zinc-50">5,675</strong>{" "}
                  data center facilities across <strong className="font-mono">148</strong>{" "}
                  countries
                </li>
                <li>
                  <strong className="font-mono">34,732</strong> networks (ASNs) +{" "}
                  <strong className="font-mono">1,309</strong> internet exchanges
                </li>
                <li>
                  <strong className="font-mono">176</strong> public cloud regions across AWS, Google,
                  Azure, Oracle
                </li>
              </ul>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-500">
                JSON by default, CSV via{" "}
                <Inline>?format=csv</Inline>. All responses are edge-cached with{" "}
                <Inline>stale-while-revalidate</Inline> and any-origin CORS. Sources include
                PeeringDB, OpenStreetMap, operator-published facility pages (Equinix, Digital
                Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS, Iron Mountain),
                datacenters.google, and datacenters.atmeta.com.
              </p>
            </Section>

            {/* ─────────── Quick start ─────────── */}
            <Section id="quick-start" number={2} title="Quick start">
              <p className="mt-5 max-w-2xl text-zinc-500">
                Sixty seconds end to end:{" "}
                <Link
                  href="/login"
              className={sheetLink}
                >
                  sign in with GitHub
                </Link>
                , generate a key on the{" "}
                <Link
                  href="/dashboard"
              className={sheetLink}
                >
                  dashboard
                </Link>
                , then list the 5 largest German Equinix sites:
              </p>
              <div className="mt-5">
                <CodeTabs
                  sample={{
                    curl: `curl '${BASE}/facilities?country=DE&operator=Equinix&limit=5' \\
  -H 'Authorization: Bearer dcw_…'`,
                    javascript: `const res = await fetch(
  '${BASE}/facilities?country=DE&operator=Equinix&limit=5',
  { headers: { Authorization: 'Bearer dcw_…' } }
);
const { data, meta } = await res.json();
console.log(data, meta);`,
                    python: `import requests

res = requests.get(
    '${BASE}/facilities',
    params={'country': 'DE', 'operator': 'Equinix', 'limit': 5},
    headers={'Authorization': 'Bearer dcw_…'},
)
res.raise_for_status()
body = res.json()
data, meta = body['data'], body['meta']`,
                  }}
                />
              </div>
              <p className="mt-4 text-base text-zinc-500">
                Free tier is 1,000 requests/month — no card required. Quota resets monthly on
                your signup anniversary (free) or billing cycle (paid).
              </p>
            </Section>

            {/* ─────────── Authentication ─────────── */}
            <Section id="authentication" number={3} title="Authentication">
              <p className="mt-5 max-w-2xl text-zinc-500">
                Every request needs a key passed as <Inline>Authorization: Bearer dcw_…</Inline>.
                Unauthenticated calls return <Inline>401 Unauthorized</Inline>.
              </p>
              <div className="mt-5">
                <CodeTabs
                  label="Authenticated request"
                  sample={{
                    curl: `curl '${BASE}/facilities?country=DE&limit=5' \\
  -H 'Authorization: Bearer dcw_…'`,
                    javascript: `const res = await fetch(
  '${BASE}/facilities?country=DE&limit=5',
  { headers: { Authorization: 'Bearer dcw_…' } }
);`,
                    python: `import requests

res = requests.get(
    '${BASE}/facilities',
    params={'country': 'DE', 'limit': 5},
    headers={'Authorization': 'Bearer dcw_…'},
)`,
                  }}
                />
              </div>
              <p className="mt-5 max-w-2xl text-base text-zinc-500">
                Keys are <Inline>dcw_</Inline> + 43 base64url chars (256 bits of entropy from
                <Inline>crypto.randomBytes</Inline>). The plaintext is shown once at creation and
                stored sha256-hashed at rest. Lost a key? Revoke and regenerate from the dashboard
                — there&rsquo;s no recovery path.
              </p>
              <p className="mt-3 max-w-2xl text-base text-zinc-500">
                Every successful response sets <Inline>X-RateLimit-Tier</Inline>,{" "}
                <Inline>X-RateLimit-Limit</Inline>, and <Inline>X-RateLimit-Remaining</Inline>.
                See <a href="#errors" className={sheetLink}>Errors &amp; rate limits</a> for the over-quota behavior.
              </p>
            </Section>

            {/* ─────────── Endpoints ─────────── */}
            <Section id="endpoints" number={4} title="Endpoints">
              <p className="mt-5 max-w-2xl text-zinc-500">
                Five endpoints, all <Inline>GET</Inline>. Each one accepts <Inline>?format=csv</Inline>{" "}
                in addition to JSON.
              </p>

              {/* /facilities */}
              <Endpoint
                id="ep-facilities"
                method="GET"
                path="/api/v1/facilities"
                description="Paginated list of data centers. The workhorse endpoint."
                params={[
                  ["country", "string", "ISO-3166-1 alpha-2 codes, comma-separated", "country=DE,FR"],
                  ["operator", "string", "Operator name. Single value uses prefix match; multiple values use exact match.", "operator=Equinix"],
                  ["min_power_mw", "number", "Minimum published power capacity, MW", "min_power_mw=10"],
                  ["status", "enum", "operational | under_construction | planned", "status=operational"],
                  ["limit", "number", "1–500, default 50", "limit=100"],
                  ["offset", "number", "0+, default 0", "offset=100"],
                  ["format", "string", "json (default) or csv", "format=csv"],
                ]}
                fields={FACILITY_LIST_FIELDS}
                sample={{
                  curl: `curl '${BASE}/facilities?country=US&limit=2' \\
  -H 'Authorization: Bearer dcw_…'`,
                  javascript: `const res = await fetch(
  '${BASE}/facilities?country=US&limit=2',
  { headers: { Authorization: 'Bearer dcw_…' } }
);
const { data, meta } = await res.json();`,
                  python: `import requests

res = requests.get(
    '${BASE}/facilities',
    params={'country': 'US', 'limit': 2},
    headers={'Authorization': 'Bearer dcw_…'},
)
data, meta = res.json()['data'], res.json()['meta']`,
                }}
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
    "total": 1394,
    "returned": 2,
    "limit": 2,
    "offset": 0,
    "next_offset": 2
  }
}`}
              />

              {/* /facilities/{slug} */}
              <Endpoint
                id="ep-facility"
                method="GET"
                path="/api/v1/facilities/{slug}"
                description="Full record for one facility — specs, networks, IXPs, and source provenance."
                fields={FACILITY_DETAIL_FIELDS}
                sample={{
                  curl: `curl '${BASE}/facilities/equinix-inc-equinix-ny2-ny4-ny5-ny6-new-york-secaucus-secaucus' \\
  -H 'Authorization: Bearer dcw_…'`,
                  javascript: `const slug = 'equinix-inc-equinix-ny2-ny4-ny5-ny6-new-york-secaucus-secaucus';
const res = await fetch(\`${BASE}/facilities/\${slug}\`, {
  headers: { Authorization: 'Bearer dcw_…' },
});
const { data } = await res.json();`,
                  python: `import requests

slug = 'equinix-inc-equinix-ny2-ny4-ny5-ny6-new-york-secaucus-secaucus'
res = requests.get(
    f'${BASE}/facilities/{slug}',
    headers={'Authorization': 'Bearer dcw_…'},
)
data = res.json()['data']`,
                }}
                response={`{
  "data": {
    "slug": "equinix-inc-equinix-ny2-...",
    "name": "Equinix NY2/NY4/NY5/NY6 - New York, Secaucus",
    "operator": "Equinix, Inc.",
    "power_mw": null,
    "space_sqft": 129436,
    "tier": null,
    "year_built": null,
    "pue": null,
    "ups_redundancy": "N+1",
    "uptime_sla": "99.9999%+",
    "certifications": ["FISMA", "HIPAA", "ISO 27001", "..."],
    "networks": [ /* 129 ASNs, each with name, asn, irr_policy */ ],
    "ixes":     [ /* 10 internet exchanges with member counts */ ],
    "sources":  [ /* 5 provenance records: source, source_url, fetched_at */ ],
    "network_count": 129,
    "ix_count": 10
  }
}`}
              />

              {/* /operators */}
              <Endpoint
                id="ep-operators"
                method="GET"
                path="/api/v1/operators"
                description="Operators ranked by facility count, with country breadth."
                params={[
                  ["country", "string", "Restrict to operators present in these countries", "country=DE,FR"],
                  ["min_facilities", "number", "Minimum facility count", "min_facilities=5"],
                  ["limit", "number", "1–1000, default 100", "limit=20"],
                  ["format", "string", "json or csv", "format=csv"],
                ]}
                fields={OPERATOR_FIELDS}
                sample={{
                  curl: `curl '${BASE}/operators?limit=5' \\
  -H 'Authorization: Bearer dcw_…'`,
                  javascript: `const res = await fetch('${BASE}/operators?limit=5', {
  headers: { Authorization: 'Bearer dcw_…' },
});
const { data } = await res.json();`,
                  python: `import requests

res = requests.get(
    '${BASE}/operators',
    params={'limit': 5},
    headers={'Authorization': 'Bearer dcw_…'},
)
data = res.json()['data']`,
                }}
                response={`{
  "data": [
    { "operator": "Equinix, Inc.",            "facility_count": 263, "country_count": 35 },
    { "operator": "Digital Realty",           "facility_count": 220, "country_count": 22 },
    { "operator": "CyrusOne Inc.",            "facility_count":  83, "country_count":  9 },
    { "operator": "DataBank, Ltd.",           "facility_count":  78, "country_count":  2 },
    { "operator": "QTS Realty Trust, Inc.",   "facility_count":  61, "country_count":  3 }
  ],
  "meta": { "total": 5 }
}`}
              />

              {/* /countries */}
              <Endpoint
                id="ep-countries"
                method="GET"
                path="/api/v1/countries"
                description="All countries with at least one facility, ranked by count."
                params={[["format", "string", "json or csv", "format=csv"]]}
                fields={COUNTRY_FIELDS}
                sample={{
                  curl: `curl '${BASE}/countries?format=csv' -o countries.csv \\
  -H 'Authorization: Bearer dcw_…'`,
                  javascript: `const res = await fetch('${BASE}/countries', {
  headers: { Authorization: 'Bearer dcw_…' },
});
const { data } = await res.json();`,
                  python: `import requests

res = requests.get(
    '${BASE}/countries',
    headers={'Authorization': 'Bearer dcw_…'},
)
data = res.json()['data']`,
                }}
                response={`{
  "data": [
    { "country": "US", "country_name": "United States", "facility_count": 1394 },
    { "country": "DE", "country_name": "Germany",        "facility_count":  359 },
    { "country": "BR", "country_name": "Brazil",         "facility_count":  303 }
  ],
  "meta": { "total": 148 }
}`}
              />

              {/* /cloud-regions */}
              <Endpoint
                id="ep-cloud-regions"
                method="GET"
                path="/api/v1/cloud-regions"
                description="All public cloud regions across AWS, Google, Azure, and Oracle."
                params={[
                  ["provider", "enum", "aws | gcp | azure | oracle, comma-separated", "provider=aws,gcp"],
                  ["country", "string", "ISO-3166-1 alpha-2 codes", "country=DE"],
                  ["format", "string", "json or csv", "format=csv"],
                ]}
                fields={CLOUD_REGION_FIELDS}
                sample={{
                  curl: `curl '${BASE}/cloud-regions?provider=aws&country=DE' \\
  -H 'Authorization: Bearer dcw_…'`,
                  javascript: `const res = await fetch(
  '${BASE}/cloud-regions?provider=aws&country=DE',
  { headers: { Authorization: 'Bearer dcw_…' } }
);
const { data } = await res.json();`,
                  python: `import requests

res = requests.get(
    '${BASE}/cloud-regions',
    params={'provider': 'aws', 'country': 'DE'},
    headers={'Authorization': 'Bearer dcw_…'},
)
data = res.json()['data']`,
                }}
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
            </Section>

            {/* ─────────── MCP ─────────── */}
            <Section id="mcp" number={5} title="MCP (AI tool access)">
              <p className="mt-5 max-w-2xl text-zinc-500">
                The same atlas, exposed as <a
                  href="https://modelcontextprotocol.io"
              className={sheetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Model Context Protocol
                </a>{" "}
                tools. Add the endpoint below to Claude Desktop, Cursor, Claude Code, or any
                other MCP-aware client and your AI gets typed access to facilities, operators,
                networks, IXPs, and cloud regions — citations included.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-zinc-200 dark:border-zinc-800 py-5 sm:grid-cols-4">
                <Pill label="Endpoint" value="/api/mcp" />
                <Pill label="Transport" value="streamable http" />
                <Pill label="Auth" value="bearer (required)" />
                <Pill label="Quota" value="shared with REST" />
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Client config
              </h3>

              <div className="mt-3 space-y-5">
                <div>
                  <div className="mb-2 font-mono text-xs text-zinc-500">
                    Claude Desktop · Cursor · any HTTP-MCP client
                  </div>
                  <Snippet>{`{
  "mcpServers": {
    "datacenters-world": {
      "url": "https://datacenters.world/api/mcp",
      "headers": {
        "Authorization": "Bearer dcw_…"
      }
    }
  }
}`}</Snippet>
                </div>

                <div>
                  <div className="mb-2 font-mono text-xs text-zinc-500">
                    Claude Code (CLI)
                  </div>
                  <Snippet>{`claude mcp add datacenters-world \\
  --transport http \\
  --header "Authorization: Bearer dcw_…" \\
  https://datacenters.world/api/mcp`}</Snippet>
                </div>

                <div>
                  <div className="mb-2 font-mono text-xs text-zinc-500">
                    Stdio-only clients (older builds) — wrap with{" "}
                    <Inline>mcp-remote</Inline>
                  </div>
                  <Snippet>{`{
  "mcpServers": {
    "datacenters-world": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://datacenters.world/api/mcp",
        "--header",
        "Authorization: Bearer dcw_…"
      ]
    }
  }
}`}</Snippet>
                </div>
              </div>

              <h3 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Tools
              </h3>
              <p className="mt-2 max-w-2xl text-base text-zinc-500">
                All five tools return a <Inline>source_url</Inline> pointing at the canonical
                facility / operator / IXP page so your AI can cite back to the dataset.
              </p>

              <div className="mt-4 overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 text-left text-sm text-zinc-500 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Tool</th>
                      <th className="px-4 py-2.5 text-left font-medium">Inputs</th>
                      <th className="px-4 py-2.5 text-left font-medium">Returns</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <ToolRow
                      name="search_facilities"
                      inputs="country[], operator (prefix), min_power_mw, limit"
                      returns="Up to 50 facilities with key facts + source_url."
                    />
                    <ToolRow
                      name="get_facility"
                      inputs="slug"
                      returns="Full record — specs, top 50 ASNs, top 20 IXPs, source provenance."
                    />
                    <ToolRow
                      name="list_operators"
                      inputs="country[], min_facilities, limit"
                      returns="Operators ranked by facility count + country breadth."
                    />
                    <ToolRow
                      name="list_countries"
                      inputs="(none)"
                      returns="All 148 countries with facility counts."
                    />
                    <ToolRow
                      name="list_cloud_regions"
                      inputs="provider, country[]"
                      returns="Hyperscale regions across AWS, Google, Azure, Oracle."
                    />
                  </tbody>
                </table>
              </div>

              <p className="mt-6 max-w-2xl text-base text-zinc-500">
                Quota note: each MCP tool call counts as one request against your monthly
                quota — same path as <Inline>/api/v1/*</Inline>. AI agents typically fan out
                3–6 tool calls per chat turn, so budget accordingly. Free tier (1,000/month)
                covers roughly 150–300 chat conversations.
              </p>
            </Section>

            {/* ─────────── Conventions ─────────── */}
            <Section id="conventions" number={6} title="Conventions">
              <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
                <Convention title="Response envelope">
                  All JSON responses are <Inline>{`{ data, meta }`}</Inline>. <Inline>data</Inline>{" "}
                  is the result; <Inline>meta</Inline> carries totals and pagination cursors.
                </Convention>
                <Convention title="Pagination">
                  Pass <Inline>limit</Inline> + <Inline>offset</Inline>. The response includes{" "}
                  <Inline>meta.next_offset</Inline> (or <Inline>null</Inline> when exhausted).
                  Lists cap at <Inline>limit=500</Inline>.
                </Convention>
                <Convention title="Caching">
                  Lists: 5-minute edge cache. Details &amp; aggregates: 1-hour. All responses use{" "}
                  <Inline>stale-while-revalidate</Inline> so cache misses still serve instantly
                  while the new value generates.
                </Convention>
                <Convention title="CSV exports">
                  Append <Inline>?format=csv</Inline>. Nested fields (e.g. <Inline>networks</Inline>,{" "}
                  <Inline>certifications</Inline>) are serialized to JSON inside their cell so
                  spreadsheets stay rectangular.
                </Convention>
                <Convention title="CORS">
                  Open to any origin. No preflight required for plain <Inline>GET</Inline>s using
                  only the <Inline>Authorization</Inline> header.
                </Convention>
                <Convention title="Stability">
                  Field additions are non-breaking. Field renames or removals ship under a new
                  major (<Inline>/api/v2/</Inline>) — never inside <Inline>v1</Inline>.
                </Convention>
              </div>
            </Section>

            {/* ─────────── Errors & rate limits ─────────── */}
            <Section id="errors" number={7} title="Errors & rate limits">
              <p className="mt-5 max-w-2xl text-zinc-500">
                Non-2xx responses use a uniform error envelope:
              </p>
              <div className="mt-4">
                <CodeTabs
                  label="Error envelope"
                  sample={{
                    curl: `# 429 Too Many Requests
{
  "error": {
    "message": "Monthly quota exceeded",
    "status": 429,
    "tier": "free",
    "monthly_limit": 1000
  }
}`,
                    javascript: `const res = await fetch('${BASE}/facilities', {
  headers: { Authorization: 'Bearer dcw_…' },
});
if (!res.ok) {
  const { error } = await res.json();
  // error.status, error.message, optional details
}`,
                    python: `res = requests.get(
    '${BASE}/facilities',
    headers={'Authorization': 'Bearer dcw_…'},
)
if not res.ok:
    err = res.json()['error']
    # err['status'], err['message']`,
                  }}
                />
              </div>

              <div className="mt-6 overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 text-left text-sm text-zinc-500 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Status</th>
                      <th className="px-4 py-2.5 text-left font-medium">When</th>
                      <th className="px-4 py-2.5 text-left font-medium">What to do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <ErrorRow status="400" when="Malformed query params (e.g. bad enum value)." action="Fix the request; check the param table for the endpoint." />
                    <ErrorRow status="401" when="Missing or invalid Authorization header." action="Sign in, create a key, re-send." />
                    <ErrorRow status="404" when="Slug not found on a detail endpoint." action="List first, then look up by exact slug." />
                    <ErrorRow status="429" when="Monthly quota exceeded for this key." action="Wait for next month, or upgrade tier on the dashboard." />
                    <ErrorRow status="5xx" when="Upstream failure (rare)." action="Retry with backoff. All endpoints are idempotent." />
                  </tbody>
                </table>
              </div>

              <p className="mt-6 max-w-2xl text-base text-zinc-500">
                Rate-limit headers on every successful response:{" "}
                <Inline>X-RateLimit-Tier</Inline> (free | pro | team | enterprise),{" "}
                <Inline>X-RateLimit-Limit</Inline> (monthly cap), and{" "}
                <Inline>X-RateLimit-Remaining</Inline>. Quotas roll over on the 1st of each month
                in UTC.
              </p>
            </Section>

            {/* ─────────── Pricing ─────────── */}
            <Section id="pricing" number={8} title="Pricing">
              <div className="mt-5 overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 text-left text-sm text-zinc-500 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Tier</th>
                      <th className="px-4 py-2.5 text-left font-medium">Quota</th>
                      <th className="px-4 py-2.5 text-left font-medium">Price</th>
                      <th className="px-4 py-2.5 text-left font-medium">For</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <PricingRow tier="Free" quota="1,000 / month" price="$0" forWho="Hobbyists, evaluation, indie tools." />
                    <PricingRow tier="Pro" quota="10,000 / month" price="$9.99 / mo" forWho="Production services, dashboards, internal tools." />
                    <PricingRow tier="Team" quota="50,000 / month" price="$39.99 / mo" forWho="Bulk analytics, market research, embedded data." />
                    <PricingRow tier="Enterprise" quota="custom" price="contact" forWho="SLA, custom exports, on-prem mirror." />
                  </tbody>
                </table>
              </div>
              <p className="mt-4 max-w-2xl text-base text-zinc-500">
                Pro and Team ship with a 3-day free trial via Polar.sh — no charge until day 4,
                cancel anytime. Upgrades take effect immediately and every active key on your
                account inherits the new tier. Manage from the{" "}
                <Link href="/dashboard" className={sheetLink}>
                  dashboard
                </Link>
                .
              </p>
            </Section>

            {/* ─────────── Versioning ─────────── */}
            <Section id="versioning" number={9} title="Versioning">
              <p className="mt-5 max-w-2xl text-zinc-500">
                All endpoints live under <Inline>/api/v1/</Inline>. Breaking changes ship under a
                new major (<Inline>/api/v2/</Inline>) — never inside <Inline>v1</Inline>. Additive
                changes (new optional query params, new response fields) ship without version
                bump.
              </p>
              <p className="mt-3 max-w-2xl text-base text-zinc-500">
                Deprecation policy: any field or param removed from <Inline>v1</Inline> gets at
                least 90 days&rsquo; notice via the <Inline>Deprecation</Inline> response header
                and a note here.
              </p>
            </Section>

            <div className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
              <p>
                Data from PeeringDB (CC-BY-SA), OpenStreetMap (ODbL), operator-published facility
                pages, datacenters.google, and datacenters.atmeta.com · Citing the API is
                appreciated · No usage analytics ·{" "}
                <Link href="/privacy" className={sheetLink}>
                  Privacy
                </Link>
              </p>
            </div>
          </article>
        </div>
    </EditorialShell>
  );
}

/* ───────────── Field schemas (response documentation) ───────────── */

type FieldRow = readonly [name: string, type: string, description: string];

const FACILITY_LIST_FIELDS: ReadonlyArray<FieldRow> = [
  ["slug", "string", "Unique, URL-safe identifier. Stable across renames."],
  ["name", "string", "Display name."],
  ["operator", "string | null", "Company that operates the facility."],
  ["code", "string | null", "Operator's internal facility code (e.g. CH5, NY9)."],
  ["city", "string | null", "Municipality."],
  ["country", "string", "ISO-3166-1 alpha-2 country code."],
  ["lat", "number", "Latitude (WGS-84)."],
  ["lng", "number", "Longitude (WGS-84)."],
  ["status", "enum", "operational · under_construction · planned · decommissioned."],
  ["power_mw", "number | null", "Published IT power capacity, megawatts. Sparse — only ~2% of rows."],
  ["space_sqft", "number | null", "Total facility area, square feet. ~10% of rows."],
  ["ups_redundancy", "string | null", "UPS redundancy spec, e.g. \"N+1\", \"2N\"."],
  ["uptime_sla", "string | null", "Uptime guarantee, e.g. \"99.9999%+\"."],
  ["network_count", "number", "Distinct ASNs present per PeeringDB."],
  ["ix_count", "number", "Distinct internet exchanges present per PeeringDB."],
];

const FACILITY_DETAIL_FIELDS: ReadonlyArray<FieldRow> = [
  ...FACILITY_LIST_FIELDS,
  ["tier", "enum | null", "Uptime Institute tier: I · II · III · IV."],
  ["year_built", "number | null", "Year construction completed."],
  ["pue", "number | null", "Power Usage Effectiveness (lower is better)."],
  ["cooling", "string | null", "Cooling system summary."],
  ["certifications", "string[] | null", "Compliance certifications (SOC 2, ISO 27001, FedRAMP, etc.)."],
  ["networks", "object[]", "ASNs present at this facility. Each entry: name, asn, irr_policy."],
  ["ixes", "object[]", "Internet exchanges present. Each entry: name, code, member_count."],
  ["sources", "object[]", "Provenance records. Each entry: source, source_url, fetched_at."],
];

const OPERATOR_FIELDS: ReadonlyArray<FieldRow> = [
  ["operator", "string", "Canonical operator name (legal-suffix form, e.g. \"Equinix, Inc.\")."],
  ["facility_count", "number", "Total facilities operated."],
  ["country_count", "number", "Distinct countries with at least one facility."],
];

const COUNTRY_FIELDS: ReadonlyArray<FieldRow> = [
  ["country", "string", "ISO-3166-1 alpha-2 code."],
  ["country_name", "string", "Full English country name."],
  ["facility_count", "number", "Total facilities in this country."],
];

const CLOUD_REGION_FIELDS: ReadonlyArray<FieldRow> = [
  ["provider", "enum", "aws · gcp · azure · oracle."],
  ["code", "string", "Region code, e.g. \"eu-central-1\"."],
  ["name", "string", "Display name, e.g. \"Europe (Frankfurt)\"."],
  ["city", "string | null", "Region city, when published."],
  ["country", "string | null", "ISO-3166-1 alpha-2 code, when published."],
  ["lat", "number", "Latitude (WGS-84)."],
  ["lng", "number", "Longitude (WGS-84)."],
  ["launched_year", "number | null", "Year the region became GA."],
];

/* ───────────── Components ───────────── */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  number?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 h-0.5 w-7 rounded-full bg-teal-500" />
      {children}
    </section>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-teal-800 dark:text-teal-300">{value}</div>
    </div>
  );
}

function Endpoint({
  id,
  method,
  path,
  description,
  params,
  fields,
  sample,
  response,
}: {
  id: string;
  method: string;
  path: string;
  description: string;
  params?: ReadonlyArray<readonly [string, string, string, string]>;
  fields?: ReadonlyArray<FieldRow>;
  sample: { curl: string; javascript: string; python: string };
  response: string;
}) {
  return (
    <article id={id} className="mt-8 scroll-mt-24 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <header className="flex flex-wrap items-baseline gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
        <span className="font-mono text-xs font-semibold tracking-wider text-teal-700 dark:text-teal-400">
          {method}
        </span>
        <code className="font-mono text-base font-medium text-zinc-900 dark:text-zinc-50">{path}</code>
        <span className="text-base text-zinc-500">— {description}</span>
      </header>

      {params && params.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div className="mb-2 text-xs font-medium text-zinc-500">
            Query parameters
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {params.map(([name, type, desc, ex]) => (
                <tr key={name}>
                  <td className="py-2 pl-1 pr-3 align-top font-mono text-sm text-zinc-900 dark:text-zinc-50">
                    {name}
                  </td>
                  <td className="py-2 pr-3 align-top font-mono text-xs text-zinc-500">
                    {type}
                  </td>
                  <td className="py-2 pr-3 align-top text-zinc-500">{desc}</td>
                  <td className="py-2 pr-1 align-top font-mono text-xs text-zinc-500">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-zinc-200 dark:border-zinc-800 px-5 py-4">
        <CodeTabs label="Request" sample={sample} />
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 px-5 py-4">
        <ResponseBlock label="Response (truncated)">{response}</ResponseBlock>
      </div>

      {fields && fields.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div className="mb-2 text-xs font-medium text-zinc-500">
            Response fields
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {fields.map(([name, type, desc]) => (
                <tr key={name}>
                  <td className="py-2 pl-1 pr-3 align-top font-mono text-sm text-zinc-900 dark:text-zinc-50">
                    {name}
                  </td>
                  <td className="py-2 pr-3 align-top font-mono text-xs text-zinc-500">
                    {type}
                  </td>
                  <td className="py-2 pr-1 align-top text-zinc-500">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function Convention({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="mt-1 text-base leading-relaxed text-zinc-500">{children}</p>
    </div>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-teal-50 px-1 py-0.5 font-mono text-[11px] text-teal-900 dark:bg-teal-950/60 dark:text-teal-200">
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
    <tr>
      <td className="px-4 py-3 align-top font-medium text-zinc-900 dark:text-zinc-50">{tier}</td>
      <td className="px-4 py-3 align-top font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-50">
        {quota}
      </td>
      <td className="px-4 py-3 align-top font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-50">
        {price}
      </td>
      <td className="px-4 py-3 align-top text-base text-zinc-500">{forWho}</td>
    </tr>
  );
}

function ToolRow({ name, inputs, returns }: { name: string; inputs: string; returns: string }) {
  return (
    <tr>
      <td className="px-4 py-3 align-top font-mono text-sm text-zinc-900 dark:text-zinc-50">
        {name}
      </td>
      <td className="px-4 py-3 align-top font-mono text-xs text-zinc-500">
        {inputs}
      </td>
      <td className="px-4 py-3 align-top text-base text-zinc-500">{returns}</td>
    </tr>
  );
}

function ErrorRow({ status, when, action }: { status: string; when: string; action: string }) {
  return (
    <tr>
      <td className="px-4 py-3 align-top font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {status}
      </td>
      <td className="px-4 py-3 align-top text-base text-zinc-900 dark:text-zinc-50">{when}</td>
      <td className="px-4 py-3 align-top text-base text-zinc-500">{action}</td>
    </tr>
  );
}
