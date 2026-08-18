import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Refresh the materialized summary views (country_summary, operator_summary,
 * facility_density). Called from ingest scripts after --apply so the next
 * render sees pre-aggregated rows instead of stale counts.
 */
export async function refreshSummaryViews(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`  (skipping summary refresh — Supabase env missing)`);
    return;
  }
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.rpc("refresh_summary_views");
  if (error) {
    console.warn(`  refresh_summary_views failed: ${error.message}`);
    return;
  }
  console.log(`  Summary views refreshed`);
}

function productionOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.datacenters.world";
  const u = new URL(raw);
  if (u.hostname === "datacenters.world") u.hostname = "www.datacenters.world";
  return u.origin;
}

/**
 * Mark index/aggregate ISR entries stale via `/api/cron/revalidate` (SWR).
 * Per-slug pages are not in the blast — they refresh on their 30d TTL.
 * Does not start a new deployment, so the existing ISR cache stays intact.
 */
export async function triggerRevalidate(reason: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log(`  (skipping on-demand revalidate — CRON_SECRET not set)`);
    return;
  }
  const url = `${productionOrigin()}/api/cron/revalidate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "follow",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`  on-demand revalidate returned ${res.status}: ${body.slice(0, 200)}`);
    return;
  }
  console.log(`  on-demand revalidate triggered (${reason})`);
}

/**
 * Fire the Vercel Deploy Hook so a new build re-bakes geojson.
 *
 * Opt-in via `--rebuild`. Each new deployment gets an empty ISR cache, so the
 * next crawl of every per-slug page is a write. Use only when the baked
 * geojson (or the build itself) must change; catalog HTML freshness is
 * `triggerRevalidate()`, not a deploy.
 *
 * No-op if VERCEL_DEPLOY_HOOK_URL isn't set.
 */
export async function triggerRebuild(reason: string): Promise<void> {
  if (!process.argv.includes("--rebuild")) {
    console.log(`  (skipping Vercel rebuild — pass --rebuild to re-bake geojson)`);
    return;
  }
  const url = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!url) {
    console.log(`  (skipping Vercel rebuild — VERCEL_DEPLOY_HOOK_URL not set)`);
    return;
  }
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`  Vercel deploy hook returned ${res.status}: ${body.slice(0, 200)}`);
    return;
  }
  console.log(`  Vercel rebuild triggered (${reason})`);
}

/**
 * After a successful ingest: SWR-revalidate index/aggregate pages + API
 * data cache. A full deploy is `--rebuild` only (geojson / build artifacts).
 */
export async function triggerCatalogFreshness(reason: string): Promise<void> {
  if (process.argv.includes("--rebuild")) {
    await triggerRebuild(reason);
    return;
  }
  await triggerRevalidate(reason);
}
