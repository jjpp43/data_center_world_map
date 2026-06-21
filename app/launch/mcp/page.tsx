import type { Metadata } from "next";
import Link from "next/link";
import { Snippet } from "@/app/api/CodeTabs";
import { AccountPill } from "@/components/AccountPill";
import { ArrowLeftIcon } from "@/components/editorial";
import { jsonForHtml } from "@/lib/json-ld";

export const revalidate = 86400;

const SITE = "https://datacenters.world";
const URL = `${SITE}/launch/mcp`;

const TITLE = "MCP server — every known data center, available to your AI";
const DESCRIPTION =
  "5,675 facilities, 34,732 networks, 1,309 IXPs, 176 cloud regions — exposed as Model Context Protocol tools. One config snippet and Claude Desktop, Cursor, or Claude Code can answer infrastructure questions with citations. Free tier 1,000 calls/month.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/launch/mcp" },
  openGraph: {
    title: "MCP server for data center data",
    description: DESCRIPTION,
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const articleLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: TITLE,
  description: DESCRIPTION,
  url: URL,
  inLanguage: "en",
  isPartOf: { "@type": "WebSite", name: "datacenters.world", url: SITE },
  about: {
    "@type": "SoftwareApplication",
    name: "datacenters-world MCP server",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
};

export default function McpLaunchPage() {
  return (
    <div className="min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForHtml(articleLd) }}
      />

      <LaunchHeader />

      <main className="relative mx-auto max-w-4xl px-6 py-14">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]"
        />

        {/* Hero */}
        <div className="max-w-3xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
            New · Model Context Protocol · datacenters.world
          </div>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            Your AI now knows every data center.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            <strong className="text-zinc-900 dark:text-zinc-100">datacenters-world</strong>{" "}
            is a hosted{" "}
            <a
              href="https://modelcontextprotocol.io"
              className="text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              MCP
            </a>{" "}
            server over the largest open atlas of data center facilities on the
            internet. Add one config snippet and Claude Desktop, Cursor, or
            Claude Code can answer infrastructure questions about{" "}
            <strong className="font-mono">5,675</strong> facilities,{" "}
            <strong className="font-mono">34,732</strong> networks, and{" "}
            <strong className="font-mono">1,309</strong> Internet exchanges —
            with a citation URL on every result.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Get a free key
            </Link>
            <a
              href="#install"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Install snippet
            </a>
            <Link
              href="/api#mcp"
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              Full docs →
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Pill label="Endpoint" value="/api/mcp" />
            <Pill label="Transport" value="streamable http" />
            <Pill label="Tools" value="5" />
            <Pill label="Free tier" value="1,000 / month" />
          </div>
        </div>

        {/* Why this exists */}
        <Section id="why" number="01" title="Why">
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            Ask Claude “which data centers does Equinix run in Frankfurt” today
            and you get a memorized list with no citations, no power numbers, no
            ASN counts. The model doesn&rsquo;t have structured data — and the
            web pages it can browse are slow, half-paywalled, and inconsistent
            across operators.
          </p>
          <p className="mt-4 max-w-2xl text-zinc-600 dark:text-zinc-300">
            This MCP server hands the model the actual dataset: facility
            records, operator-published specs, peering memberships from
            PeeringDB, IXP rosters, and hyperscale cloud regions. Every tool
            response carries a{" "}
            <Inline>source_url</Inline> pointing back at the canonical page on
            datacenters.world, so the model can cite. Free tier covers ~150–300
            chat conversations per month.
          </p>
        </Section>

        {/* What the agent can answer */}
        <Section id="examples" number="02" title="What the agent can answer">
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            Drop into any MCP-aware client and ask, in natural language:
          </p>
          <ul className="mt-5 space-y-3">
            <Example>
              Compare Equinix vs Digital Realty in Frankfurt — facility count,
              total power, ASNs peered, IXPs reachable.
            </Example>
            <Example>
              List every Tier IV data center in Singapore with at least 10 MW
              and BGP peering at SGIX.
            </Example>
            <Example>
              For each AWS region in Europe, name the city, country, and the
              nearest carrier-neutral facility with 100+ ASNs.
            </Example>
            <Example>
              Which operators have facilities in more than 20 countries? Rank
              them by total network count.
            </Example>
          </ul>
        </Section>

        {/* Install */}
        <Section id="install" number="03" title="Install">
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            One snippet per client. The endpoint is streamable HTTP, so any
            modern MCP-aware tool can talk to it directly. The bearer key gates
            access and tracks usage — create one for free from the{" "}
            <Link
              href="/dashboard"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              dashboard
            </Link>
            .
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
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
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
                Claude Code (CLI)
              </div>
              <Snippet>{`claude mcp add datacenters-world \\
  --transport http \\
  --header "Authorization: Bearer dcw_…" \\
  https://datacenters.world/api/mcp`}</Snippet>
            </div>

            <div>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
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
        </Section>

        {/* Tools */}
        <Section id="tools" number="04" title="Tools">
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            Five tools, each typed with{" "}
            <a
              href="https://zod.dev"
              className="text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              Zod
            </a>{" "}
            schemas so the model picks the right one without guessing.
          </p>

          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-100/80 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Tool</th>
                  <th className="px-4 py-2.5 text-left font-medium">Inputs</th>
                  <th className="px-4 py-2.5 text-left font-medium">Returns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
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
        </Section>

        {/* Pricing */}
        <Section id="pricing" number="05" title="Pricing">
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            Same quota as the REST API — one key works for both surfaces.
            Protocol overhead (initialize, tool list, notifications) is{" "}
            <strong>not</strong> charged; only{" "}
            <Inline>tools/call</Inline> counts against your monthly quota.
          </p>

          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-100/80 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Tier</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tool calls / month</th>
                  <th className="px-4 py-2.5 text-left font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                <PriceRow tier="Free" quota="1,000" price="$0" />
                <PriceRow tier="Pro" quota="10,000" price="$9.99 / mo" />
                <PriceRow tier="Team" quota="50,000" price="$39.99 / mo" />
                <PriceRow tier="Enterprise" quota="custom" price="contact" />
              </tbody>
            </table>
          </div>
          <p className="mt-5 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Pro and Team include a 3-day free trial. Quotas roll over monthly
            — anniversary date for Free, billing-period for paid.
          </p>
        </Section>

        {/* Source / closing */}
        <Section id="source" number="06" title="Where the data comes from">
          <p className="mt-5 max-w-2xl text-zinc-600 dark:text-zinc-300">
            PeeringDB for interconnect-relevant facilities, operator-published
            pages (Equinix, Digital Realty, DataBank, Cologix, CoreSite,
            CyrusOne, QTS, Iron Mountain), OpenStreetMap for location
            cross-checks, plus dedicated scrapers for{" "}
            <a
              href="https://datacenters.google"
              className="text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              datacenters.google
            </a>{" "}
            and{" "}
            <a
              href="https://datacenters.atmeta.com"
              className="text-blue-600 hover:underline dark:text-blue-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              datacenters.atmeta.com
            </a>
            . Full methodology, source counts, and known gaps live on{" "}
            <Link
              href="/methodology"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              /methodology
            </Link>
            .
          </p>
          <p className="mt-4 max-w-2xl text-zinc-600 dark:text-zinc-300">
            The whole dataset is also browsable as a public map at{" "}
            <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
              datacenters.world
            </Link>
            , and the same atlas is exposed as a JSON/CSV REST API at{" "}
            <Link
              href="/api"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              /api
            </Link>
            .
          </p>
        </Section>

        {/* CTA */}
        <div className="mt-16 overflow-hidden rounded-3xl border border-zinc-300 bg-gradient-to-br from-indigo-50/70 via-white to-white p-8 shadow-sm dark:border-zinc-700 dark:from-indigo-950/30 dark:via-zinc-900/40 dark:to-zinc-900/40">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Plug it in.
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
            Sign in with GitHub, create a key, paste the snippet. Sixty seconds
            to working tool calls inside Claude or Cursor.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Sign in with GitHub
            </Link>
            <Link
              href="/api#mcp"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Read the full docs
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function LaunchHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200/60 bg-white/75 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/75">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-6 py-3.5">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <ArrowLeftIcon /> Map
        </Link>
        <div className="flex items-center gap-5">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
          <AccountPill />
        </div>
      </div>
    </header>
  );
}

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 border-t border-zinc-200/70 pt-6 dark:border-zinc-800/60">
        <div className="flex items-baseline gap-5">
          <span className="font-mono text-5xl font-light leading-none tabular-nums text-indigo-500 dark:text-indigo-400">
            {number}
          </span>
          <h2 className="font-mono text-xl font-semibold uppercase tracking-[0.12em] text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
        </div>
        <a
          href={`#${id}`}
          aria-label={`Link to ${title}`}
          className="font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          #
        </a>
      </div>
      {children}
    </section>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-300 bg-white px-3 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-indigo-600 dark:text-indigo-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
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

function Example({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative rounded-xl border border-zinc-200 bg-white/70 px-5 py-3.5 text-zinc-700 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
      <span
        aria-hidden
        className="absolute left-0 top-3 inline-block h-5 w-[3px] -translate-x-px rounded-sm bg-indigo-500/80 dark:bg-indigo-400/80"
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
        Ask
      </span>
      <p className="mt-1 text-base leading-snug">{children}</p>
    </li>
  );
}

function ToolRow({
  name,
  inputs,
  returns,
}: {
  name: string;
  inputs: string;
  returns: string;
}) {
  return (
    <tr>
      <td className="px-4 py-3 align-top font-mono text-sm text-zinc-900 dark:text-zinc-100">
        {name}
      </td>
      <td className="px-4 py-3 align-top font-mono text-xs text-indigo-600 dark:text-indigo-400">
        {inputs}
      </td>
      <td className="px-4 py-3 align-top text-sm text-zinc-700 dark:text-zinc-300">
        {returns}
      </td>
    </tr>
  );
}

function PriceRow({
  tier,
  quota,
  price,
}: {
  tier: string;
  quota: string;
  price: string;
}) {
  return (
    <tr>
      <td className="px-4 py-3 align-top text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {tier}
      </td>
      <td className="px-4 py-3 align-top font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
        {quota}
      </td>
      <td className="px-4 py-3 align-top font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
        {price}
      </td>
    </tr>
  );
}
