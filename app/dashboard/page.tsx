import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { supabaseAuthServer } from "@/lib/supabase-server";
import { TIER_LIMITS, generateApiKey, tierLabel } from "@/lib/api-keys";
import { POLAR_PRO_PRODUCT_ID, POLAR_TEAM_PRODUCT_ID } from "@/lib/polar";
import { Stat } from "@/components/editorial";
import { KeysClient } from "./KeysClient";

const INACTIVE_THRESHOLD_DAYS = 14;

function daysUntilMonthEnd(now = new Date()): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const ms = next.getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function isStaleUnused(createdAt: string, lastUsedAt: string | null): boolean {
  if (lastUsedAt) return false;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return ageDays >= INACTIVE_THRESHOLD_DAYS;
}

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your datacenters.world API keys and subscription.",
  alternates: { canonical: "/dashboard" },
  robots: { index: false, follow: false },
};

interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  tier: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  current_month_usage: number;
}

interface SubscriptionRow {
  tier: string;
  status: string;
  current_period_end: string | null;
  polar_subscription_id: string;
}

async function createKey(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim() || "Untitled key";
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { plaintext, hash, display_prefix } = generateApiKey();
  const { error } = await sb.from("api_keys").insert({
    user_id: user.id,
    key_hash: hash,
    key_prefix: display_prefix,
    name,
    tier: "free",
  });
  if (error) throw error;

  revalidatePath("/dashboard");
  redirect(`/dashboard?reveal=${encodeURIComponent(plaintext)}`);
}

async function revokeKey(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  await sb
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/dashboard");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ reveal?: string; status?: string }>;
}) {
  const { reveal, status } = await searchParams;
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [keysRes, subsRes] = await Promise.all([
    sb
      .from("api_keys")
      .select("id, name, key_prefix, tier, created_at, last_used_at, revoked_at, current_month_usage")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<KeyRow[]>(),
    sb
      .from("subscriptions")
      .select("tier, status, current_period_end, polar_subscription_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<SubscriptionRow[]>(),
  ]);

  const keys = keysRes.data ?? [];
  const active = subsRes.data?.[0] ?? null;
  const isActive = active && ["active", "trialing"].includes(active.status);
  const currentTier = isActive && active ? active.tier : "free";
  const proConfigured = !!POLAR_PRO_PRODUCT_ID;
  const teamConfigured = !!POLAR_TEAM_PRODUCT_ID;
  const anyUnconfigured = !proConfigured || !teamConfigured;

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const totalUsage = activeKeys.reduce((sum, k) => sum + (k.current_month_usage ?? 0), 0);
  const daysToReset = daysUntilMonthEnd();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Account</div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Bearer-token credentials and subscription for <span className="font-mono">/api/v1/*</span>.
      </p>

      {status === "success" && (
        <div className="mt-6 rounded-xl border border-emerald-300/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          Subscription confirmed. It can take a few seconds for your tier to flip — refresh in a
          moment if you don&rsquo;t see it below yet.
        </div>
      )}

      <KeysClient reveal={reveal ?? null} />

      <section className="mt-8 grid grid-cols-3 gap-3">
        <Stat
          label="Usage this month"
          value={totalUsage.toLocaleString()}
          size="sm"
          live={totalUsage > 0}
        />
        <Stat
          label="Active keys"
          value={activeKeys.length.toLocaleString()}
          size="sm"
        />
        <Stat
          label="Quota resets in"
          value={`${daysToReset}d`}
          size="sm"
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Plan</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PlanCard
            tier="free"
            name="Free"
            price="Free"
            quota="500 requests/month"
            description="Hobby projects, evaluation, indie tools."
            state={planState("free", currentTier)}
            configured
          />
          <PlanCard
            tier="pro"
            name="Pro"
            price="$10.99 / mo"
            quota="10,000 requests/month"
            description="Production services, dashboards, internal tools."
            state={planState("pro", currentTier)}
            configured={proConfigured}
          />
          <PlanCard
            tier="team"
            name="Team"
            price="$49.99 / mo"
            quota="50,000 requests/month"
            description="Bulk analytics, market research, embedded data."
            state={planState("team", currentTier)}
            configured={teamConfigured}
          />
        </div>

        {isActive && active?.current_period_end && (
          <p className="mt-3 text-xs text-zinc-500">
            Renews {new Date(active.current_period_end).toLocaleDateString()} · Manage payment,
            invoices, or cancel from the{" "}
            <a
              href="https://polar.sh/portal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Polar customer portal ↗
            </a>
          </p>
        )}

        {anyUnconfigured && (
          <p className="mt-3 text-xs text-zinc-500">
            Paid tiers are wired but waiting on Polar.sh product IDs (
            <span className="font-mono">POLAR_PRO_PRODUCT_ID</span> /{" "}
            <span className="font-mono">POLAR_TEAM_PRODUCT_ID</span>) in the deployment env. They
            unlock automatically once set.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {keys.length === 0 ? "API keys" : `API keys (${keys.length})`}
        </h2>
        <form
          action={createKey}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/70 bg-white/60 p-4 dark:border-zinc-800/60 dark:bg-zinc-900/40"
        >
          <label className="flex-1 min-w-[200px] text-xs">
            <div className="mb-1 font-mono uppercase tracking-wider text-zinc-500">Name</div>
            <input
              name="name"
              type="text"
              placeholder="e.g. production"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder-zinc-600"
              required
              maxLength={64}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Create key
          </button>
        </form>

        {keys.length > 0 && (
          <ul className="mt-4 divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {keys.map((k) => {
              const limit = TIER_LIMITS[k.tier] ?? TIER_LIMITS.free;
              const pct = Math.min(100, Math.round((k.current_month_usage / limit) * 100));
              const isRevoked = !!k.revoked_at;
              return (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-medium ${
                          isRevoked
                            ? "text-zinc-400 line-through"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {k.name}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                        {tierLabel(k.tier)}
                      </span>
                      {isRevoked && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          Revoked
                        </span>
                      )}
                      {!isRevoked && isStaleUnused(k.created_at, k.last_used_at) && (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          title={`No requests in the ${INACTIVE_THRESHOLD_DAYS}+ days since creation`}
                        >
                          Unused
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span className="font-mono">{k.key_prefix}</span>
                      <span>created {new Date(k.created_at).toLocaleDateString()}</span>
                      {k.last_used_at && (
                        <span>used {new Date(k.last_used_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    {!isRevoked && (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800/70">
                          <div
                            className="h-full bg-indigo-500/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                          {k.current_month_usage.toLocaleString()} / {limit.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                  {!isRevoked && (
                    <form action={revokeKey}>
                      <input type="hidden" name="id" value={k.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-zinc-200/70 px-3 py-1.5 text-xs text-zinc-600 hover:border-red-300 hover:text-red-600 dark:border-zinc-800/60 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:text-red-400"
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-200/70 bg-white/40 p-5 dark:border-zinc-800/60 dark:bg-zinc-900/30">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">How to use</h3>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-900 p-4 font-mono text-xs leading-relaxed text-zinc-100">{`curl https://datacenters.world/api/v1/facilities?country=DE \\
     -H "Authorization: Bearer dcw_..."`}</pre>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Pass the key in the <span className="font-mono">Authorization</span> header on every
          request. Responses include <span className="font-mono">X-RateLimit-Remaining</span> and{" "}
          <span className="font-mono">X-RateLimit-Limit</span> headers.
        </p>
      </section>
    </main>
  );
}

const TIER_ORDER = ["free", "pro", "team", "enterprise"] as const;
type PlanState = "below" | "current" | "above";

function planState(plan: string, current: string): PlanState {
  const p = TIER_ORDER.indexOf(plan as (typeof TIER_ORDER)[number]);
  const c = TIER_ORDER.indexOf(current as (typeof TIER_ORDER)[number]);
  if (p === c) return "current";
  return p > c ? "above" : "below";
}

function PlanCard({
  tier,
  name,
  price,
  quota,
  description,
  state,
  configured,
}: {
  tier: "free" | "pro" | "team";
  name: string;
  price: string;
  quota: string;
  description: string;
  state: PlanState;
  configured: boolean;
}) {
  const isCurrent = state === "current";
  const isBelow = state === "below";
  const isPaidUpgrade = state === "above" && tier !== "free";

  const cardClasses = [
    "relative flex flex-col rounded-2xl border p-5 transition-colors",
    isCurrent
      ? "border-emerald-400/70 bg-emerald-50/60 ring-1 ring-emerald-400/40 dark:border-emerald-700/60 dark:bg-emerald-950/20 dark:ring-emerald-500/30"
      : "border-zinc-200/70 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-900/40",
    isBelow ? "opacity-60" : "",
  ].join(" ");

  return (
    <div className={cardClasses}>
      {isCurrent && (
        <span className="absolute -top-2.5 left-4 rounded bg-emerald-500 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white shadow-sm dark:bg-emerald-600">
          Current plan
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{name}</h3>
        <div className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
          {price}
        </div>
      </div>
      <p className="mt-1 font-mono text-xs tabular-nums text-zinc-500">{quota}</p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {description}
      </p>

      {isPaidUpgrade && (
        <form action="/api/billing/checkout" method="post" className="mt-5">
          <input type="hidden" name="tier" value={tier} />
          <button
            type="submit"
            disabled={!configured}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            {configured ? `Upgrade to ${name}` : "Coming soon"}
          </button>
        </form>
      )}

      {isCurrent && (
        <div className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-100/40 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-700/30 dark:bg-emerald-950/30 dark:text-emerald-300">
          Your plan
        </div>
      )}

      {isBelow && (
        <div className="mt-5 text-center text-xs text-zinc-500">
          {tier === "free"
            ? "Cancel in Polar portal to downgrade"
            : "Lower than your current plan"}
        </div>
      )}
    </div>
  );
}
