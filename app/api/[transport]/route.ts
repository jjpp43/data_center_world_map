import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  getCloudRegions,
  getCountryAggregates,
  getFacilitiesPage,
  getFacilityDetail,
  getOperatorAggregates,
} from "@/lib/api-data";

export const runtime = "nodejs";
export const maxDuration = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

// Real slugs are kebab-case ASCII — same shape gate as /api/v1/facilities/[slug].
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_facilities",
      {
        title: "Search facilities",
        description:
          "Search the global data center catalog. Filter by country (ISO-2), operator (prefix match), or minimum power. Returns up to 50 matches with key facts and a source_url for citation. Use list_countries / list_operators first if you don't know the exact filter values.",
        inputSchema: {
          country: z
            .array(z.string().length(2))
            .optional()
            .describe("ISO 3166-1 alpha-2 country codes, e.g. ['US', 'GB']"),
          operator: z
            .string()
            .optional()
            .describe("Operator-name prefix, e.g. 'Equinix' or 'Digital Realty'"),
          min_power_mw: z
            .number()
            .min(0)
            .optional()
            .describe("Minimum nameplate power in megawatts"),
          limit: z.number().int().min(1).max(50).default(20),
        },
      },
      async ({ country, operator, min_power_mw, limit }) => {
        const { rows, total } = await getFacilitiesPage({
          countries: country?.map((c) => c.toUpperCase()) ?? [],
          operators: operator ? [operator] : [],
          minPowerMw: min_power_mw ?? null,
          status: null,
          limit,
          offset: 0,
        });
        return jsonContent({
          matched_total: total,
          returned: rows.length,
          facilities: rows.map((r) => ({
            slug: r.slug,
            name: r.name,
            operator: r.operator,
            city: r.city,
            country: r.country,
            power_mw: r.power_mw,
            status: r.status,
            network_count: r.network_count,
            ix_count: r.ix_count,
            source_url: `${SITE}/facility/${r.slug}`,
          })),
        });
      },
    );

    server.registerTool(
      "get_facility",
      {
        title: "Get facility detail",
        description:
          "Look up one data center by slug. Returns full specs, source citations, the top 50 peered ASNs, and the top 20 Internet exchanges. Cite source_url in any user-facing answer.",
        inputSchema: {
          slug: z
            .string()
            .describe("Facility slug, e.g. 'equinix-ld8' or 'digital-realty-ams1'"),
        },
      },
      async ({ slug }) => {
        if (!SLUG_SHAPE.test(slug)) {
          return jsonContent({ error: "not_found", slug });
        }
        const detail = await getFacilityDetail(slug);
        if (!detail) return jsonContent({ error: "not_found", slug });
        return jsonContent({
          slug: detail.slug,
          name: detail.name,
          operator: detail.operator,
          country: detail.country,
          city: detail.city,
          status: detail.status,
          power_mw: detail.power_mw,
          space_sqft: detail.space_sqft,
          tier: detail.tier,
          pue: detail.pue,
          year_built: detail.year_built,
          year_opened: detail.year_opened,
          ups_redundancy: detail.ups_redundancy,
          generator_redundancy: detail.generator_redundancy,
          cooling: detail.cooling,
          uptime_sla: detail.uptime_sla,
          website: detail.website,
          networks: detail.networks
            .slice(0, 50)
            .map((n) => ({ asn: n.asn, name: n.name })),
          network_count: detail.network_count,
          ixes: detail.ixes
            .slice(0, 20)
            .map((i) => ({ name: i.name, country: i.country, net_count: i.net_count })),
          ix_count: detail.ix_count,
          sources: detail.sources.map((s) => ({ source: s.source, url: s.source_url })),
          source_url: `${SITE}/facility/${detail.slug}`,
        });
      },
    );

    server.registerTool(
      "list_operators",
      {
        title: "List operators",
        description:
          "Rank data center operators by facility count, optionally restricted to specific countries. Useful for 'who are the top operators in X' style questions.",
        inputSchema: {
          country: z
            .array(z.string().length(2))
            .optional()
            .describe("Restrict to these ISO-2 country codes"),
          min_facilities: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ country, min_facilities, limit }) => {
        const aggregates = await getOperatorAggregates(
          country?.map((c) => c.toUpperCase()) ?? [],
        );
        const rows = aggregates
          .filter((r) => r.facility_count >= min_facilities)
          .slice(0, limit);
        return jsonContent({ returned: rows.length, operators: rows });
      },
    );

    server.registerTool(
      "list_countries",
      {
        title: "List countries",
        description:
          "All 148 countries with at least one data center, ranked by facility count. Use to discover valid ISO-2 codes for other tools.",
        inputSchema: {},
      },
      async () => {
        const rows = await getCountryAggregates();
        return jsonContent({ returned: rows.length, countries: rows });
      },
    );

    server.registerTool(
      "list_cloud_regions",
      {
        title: "List hyperscale cloud regions",
        description:
          "Hyperscale cloud regions for AWS, GCP, Azure, and Oracle. Filterable by provider and country. These are region-grain (not building-grain) — for building locations, use search_facilities.",
        inputSchema: {
          provider: z.enum(["aws", "gcp", "azure", "oracle"]).optional(),
          country: z.array(z.string().length(2)).optional(),
        },
      },
      async ({ provider, country }) => {
        const rows = await getCloudRegions(
          provider ? [provider] : [],
          country?.map((c) => c.toUpperCase()) ?? [],
        );
        return jsonContent({ returned: rows.length, regions: rows });
      },
    );
  },
  {
    serverInfo: {
      name: "datacenters-world",
      version: "1.0.0",
    },
  },
  {
    basePath: "/api",
    disableSse: true,
    maxDuration: 60,
    verboseLogs: false,
  },
);

export { handler as DELETE, handler as GET, handler as POST };
