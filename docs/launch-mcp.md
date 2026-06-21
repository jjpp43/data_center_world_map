# MCP launch — drafts for user review

These are drafts. Review, tweak voice, then post yourself. Nothing here is
sent automatically.

Numbers used throughout (keep in sync with the live atlas):

- 5,675 facilities
- 34,732 networks (ASNs)
- 1,309 Internet exchanges
- 176 cloud regions across AWS, Google, Azure, Oracle

Permanent landing page: <https://datacenters.world/launch/mcp>

---

## 1. Hacker News (Show HN)

**Title** (78 chars — under the 80-char limit):

```
Show HN: An MCP server for every known data center on Earth (5,675 facilities)
```

**Body:**

```
I run datacenters.world — a public map of every data center I can find
solid evidence for. Today I'm shipping a hosted MCP server over the same
dataset so AI agents can query it directly.

Endpoint: https://datacenters.world/api/mcp
Landing: https://datacenters.world/launch/mcp
REST + docs: https://datacenters.world/api

Five tools:
- search_facilities (country, operator, min power)
- get_facility (slug → specs, top ASNs, top IXPs, sources)
- list_operators
- list_countries
- list_cloud_regions (AWS / GCP / Azure / Oracle)

Every tool response includes a source_url back to the canonical facility
page on the site so the model can cite. Same dataset, sources, and
methodology as the public map.

Why I built it: I wanted Claude to be able to answer "which Equinix
facilities in Frankfurt have BGP peering at DE-CIX and 10MW+" without
making things up. Today most LLMs return memorized lists with no
citations. PeeringDB has the raw data but it's not structured for
agent use, and operator pages are inconsistent.

Free tier is 1,000 tool calls / month. Protocol overhead (initialize,
tools/list, notifications) is not charged — only actual tool calls.

Honest limitations:
- PeeringDB is interconnect-relevant only, so my coverage skews toward
  carrier-neutral colo. ~2,600 US facilities are still missing vs
  datacentermap.com (whose ToS forbids scraping).
- Microsoft Azure: region-grain only, no buildings yet.
- power_mw fill rate is 2.4%, year_built 0.7% — the spec gap in
  PeeringDB shows.

Sources: PeeringDB, OpenStreetMap, operator pages (Equinix, Digital
Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS, Iron Mountain),
datacenters.google, datacenters.atmeta.com. Full methodology at
/methodology.

Happy to answer anything.
```

Posting tips:
- Submit at <https://news.ycombinator.com/submit>
- URL field: `https://datacenters.world/launch/mcp`
- Text field: the body above
- Best window for Show HN: Tue–Thu 8–10am Pacific. Stay around the
  thread for the first 3 hours to reply.

---

## 2. X / Twitter thread

**Tweet 1 (hook):**

```
Built an MCP server over every known data center on Earth.

5,675 facilities · 34,732 ASNs · 1,309 IXPs · 176 cloud regions.

Drop one snippet into Claude Desktop / Cursor / Claude Code and your
agent can answer real infrastructure questions — with citations.

https://datacenters.world/launch/mcp
```

(Attach: a screenshot of the /launch/mcp page hero or a screenshot of
Claude using the tool to answer an Equinix-vs-Digital-Realty question.)

**Tweet 2 (what it unlocks):**

```
Examples you can ask once it's installed:

→ Compare Equinix vs Digital Realty in Frankfurt (count, MW, peered ASNs)
→ Every Tier IV in Singapore with 10MW+ and BGP at SGIX
→ For each AWS EU region, name the nearest 100+ ASN carrier-neutral facility

The model picks the right tool from a typed Zod schema.
```

**Tweet 3 (install):**

```
Install (Claude Desktop / Cursor / any HTTP-MCP client):

{
  "mcpServers": {
    "datacenters-world": {
      "url": "https://datacenters.world/api/mcp",
      "headers": { "Authorization": "Bearer dcw_…" }
    }
  }
}

Get a free key: https://datacenters.world/dashboard
```

**Tweet 4 (why):**

```
Why bother:
LLMs today return memorized DC lists with no citations, no power
numbers, no peering data. PeeringDB has the raw data but it's not
structured for agents. Operator pages are inconsistent.

This is one curated, cited atlas wired straight into the model.
```

**Tweet 5 (sources + honesty):**

```
Sources: PeeringDB, OpenStreetMap, operator pages (Equinix, Digital
Realty, DataBank, Cologix, CoreSite, CyrusOne, QTS, Iron Mountain),
datacenters.google, datacenters.atmeta.com.

Honest gaps: ~2,600 US facilities missing (PeeringDB scope), Azure is
region-grain only, power_mw filled on 2.4% of records.
```

**Tweet 6 (close + CTA):**

```
Free tier: 1,000 tool calls / month. Protocol overhead (handshake,
tool list) doesn't count — only real tool calls.

Full docs: https://datacenters.world/api
Landing: https://datacenters.world/launch/mcp

Would love to hear what you wire it into.
```

---

## 3. Registry submissions

### a. `modelcontextprotocol/servers` (official servers list)

Repo: <https://github.com/modelcontextprotocol/servers>

This is the official upstream list. Fork, edit `README.md` under the
"Community Servers" section, open a PR. Suggested line:

```markdown
- **[datacenters.world](https://datacenters.world/api/mcp)** — Read access to the largest open atlas of data center facilities (5,675 facilities, 34,732 ASNs, 1,309 IXPs, 176 cloud regions). Five typed tools, every response cites a source URL. Free tier 1,000 calls/mo.
```

Keep it under one line; match neighbors' format. PR title:
`Add datacenters.world MCP server (data center facilities atlas)`.

### b. `punkpeye/awesome-mcp-servers`

Repo: <https://github.com/punkpeye/awesome-mcp-servers>

Community curated. Same line as above works under the "Other" or
"Data" category — check the latest README structure when you submit.

### c. Smithery.ai

Site: <https://smithery.ai/>

Smithery indexes MCP servers and supports both stdio and remote HTTP
servers. Sign in, click "Add Server" or follow their PR-based
submission flow. You will need:

- Server name: `datacenters-world`
- Transport: `streamable-http`
- URL: `https://datacenters.world/api/mcp`
- Auth: bearer (instruct users to bring their own key)
- Short description: same one-liner as above
- Tag(s): data, infrastructure, networking

Their exact submission format has shifted a couple of times — check
their docs before filling the form. Their template repo (if PR-based)
usually wants a `smithery.yaml` with the above fields.

### d. Anthropic MCP catalog

Anthropic's catalog lives at <https://docs.claude.com/en/docs/agents-and-tools/mcp>
and the submission process is the form linked there. Submit with:

- Server name: `datacenters-world`
- Maintainer: Junna Park
- URL: `https://datacenters.world/api/mcp`
- One-line description: as above
- Use case: infrastructure / data center / networking research
- Auth: bearer (sign in at /dashboard)

The catalog has been changing fast — confirm the current submission
target before posting.

---

## 4. Follow-up: subreddits / forums (optional, later)

- r/devops — only if framed around the use case ("MCP server for infra
  research") not the product
- r/MCP if active — yes (small but on-topic)
- LinkedIn — repurpose the X thread as a single post, lead with the
  problem ("LLMs hallucinate data center facts") not the product

Skip Reddit DC-specific subs (r/datacenter etc.) — they're hostile to
self-promo. The X / HN / registry path is enough for launch.

---

## Order of operations (recommended)

1. Confirm the `/launch/mcp` page renders correctly in prod.
2. Apply migration 0018 (so MCP handshake doesn't burn quota).
3. Post HN Show in the Tue–Thu 8–10am Pacific window.
4. Crosspost X thread within an hour of HN going live.
5. Open the three registry PRs the same day (links back to /launch/mcp
   give the PRs traction signal).
6. Stay near both threads for the first 3 hours to reply.
