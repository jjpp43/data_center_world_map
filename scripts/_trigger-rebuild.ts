import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Refresh the materialized summary views (country_summary, operator_summary,
 * facility_density). Called from ingest scripts after --apply so the next
 * build sees pre-aggregated rows instead of stale counts.
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

/**
 * Fire the Vercel Deploy Hook so a new build picks up the data we just wrote.
 * No-op if VERCEL_DEPLOY_HOOK_URL isn't set — keeps local dev free of friction.
 */
export async function triggerRebuild(reason: string): Promise<void> {
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
