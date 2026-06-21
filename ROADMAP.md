# Roadmap — Pivot from API-as-product to answers + distribution

**Last updated:** 2026-06-20
**Status:** Phase 1 in progress

## Context

Phases 1–14 of the original build plan shipped. Public API + Polar monetization is live but acquisition is weak — nobody searches "data center API." Self-serve developer monetization assumes inbound that isn't happening.

This roadmap is the pivot: stop selling the API as the product, start using it as the *upsell* under finished answers and B2B distribution. Original Phase 12 MCP work is the unfair advantage — the directory ecosystem is thin and actively hunting for legitimate servers.

See CLAUDE.md for codebase + technical state. This file is strategy/sequencing only.

---

## Phase 1 — MCP distribution (in progress)

**Goal:** Free top-of-funnel from the audience that already runs agentic workflows. Convert the existing MCP server into a launched, discoverable product.

**Tasks**

1. **Fix protocol-overhead quota bug** (prerequisite — agentic clients burn 1k free-tier quota in one session today)
   - `proxy.ts`: inspect JSON-RPC body before charging; skip `initialize`, `tools/list`, `notifications/*`
   - Listed in CLAUDE.md "Open improvements"
2. **Lightweight launch page** at `/launch/mcp`
   - One permanent on-site URL: pitch + install snippet + tool list + link to `/api`
   - Cross-postable from HN/X without sending traffic to someone else's platform
3. **Registry submissions**
   - `smithery.ai` (PR-based)
   - `modelcontextprotocol/servers` (awesome list, GitHub PR)
   - Anthropic MCP catalog (submission form)
4. **Launch posts** (drafted here, user posts)
   - HN: "Show HN: MCP server for every known data center on Earth (5,675 facilities)"
   - X thread: 5–7 tweets, install snippet + 1 demo screenshot

**Success metric:** 50+ unique MCP `initialize` calls in week 1; 5+ paid trial starts in month 1.

**Time:** ~1 week.

---

## Phase 2 — One narrow tool (open)

**Goal:** Inbound SEO traffic from a query type that currently has no good answer. Naturally upsells to API/MCP.

Decision deferred until Phase 1 ships and we have signal on which audience showed up.

**Options under consideration:**

- **Cloud region launch tracker + email list** — uniquely novel (no good tracker exists), viral on infra Twitter/HN, monetizes via sponsorship. ~1 week. Needs `cloud_region_events` table, diff job, Resend integration, `/cloud-regions/changelog` page + alerts signup.
- **Operator comparison pages** — reuses existing `/operators/` + editorial system. ~3 days. Targets "Equinix vs Digital Realty Frankfurt" procurement queries. Lower ceiling but lowest engineering cost.

**Explicitly skipped:** Latency estimator. Generic, big UX surface, competes with AWS/GCP's own tools, doesn't reuse existing data work.

---

## Phase 3 — B2B licensing experiment (time-boxed)

**Goal:** Validate whether founder-led sales to research firms / consultants / underwriters / telecom is real, without pivoting the whole business around it.

**Constraint:** 15 cold emails, 2-week window. If 2+ replies → continue and build a Data License landing page. If 0 → kill the motion, move on, that's signal.

**Target list (draft):**
- Synergy Research, Cushman & Wakefield DC practice, Datacenter Dynamics
- Site selection consultants (JLL, CBRE Data Center Solutions)
- Risk underwriters: FM Global, AXA XL (DC BI insurance)
- Network engineers at top-20 ISPs / IXP operators

**Pitch hook:** facility-level ASN + IXP structured data for 5,675 DCs they'd otherwise scrape from PeeringDB by hand.

---

## Phase 4 — Sponsored placement (deferred)

**Trigger:** Wait until site has consistent traffic (define: 10k uniques/month). Premature without it.

Then: "verified operator" badges on facility pages, colo/CDN/monitoring sponsor slots. Inclusion stays unpaid (CLAUDE.md monetization invariant).

---

## What we are NOT doing

- **No latency estimator.** See Phase 2 rationale.
- **No pivot away from the public API.** API stays live; it becomes the upsell layer under finished tools, not the headline product.
- **No paid inclusion / pay-to-list.** Carries from original plan.
- **No aggressive lead-gen forms or hard paywall on public map.** Carries from original plan.

## Open improvements (still relevant, separate from pivot)

The "Open improvements" section in CLAUDE.md (more MCP tools, vector tiles, `noindex` long-tail, account deletion, etc.) is still the punch list for product polish. The pivot phases run alongside it, not instead of it.
