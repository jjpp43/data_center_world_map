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
