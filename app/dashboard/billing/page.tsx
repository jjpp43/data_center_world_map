import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAuthServer } from "@/lib/supabase-server";
import { POLAR_PRO_PRODUCT_ID, POLAR_TEAM_PRODUCT_ID } from "@/lib/polar";
import { TIER_LIMITS, tierLabel } from "@/lib/api-keys";

export const metadata: Metadata = {
  title: "Billing",
  description: "Manage your datacenters.world API subscription.",
  alternates: { canonical: "/dashboard/billing" },
  robots: { index: false, follow: false },
};

interface SubscriptionRow {
  tier: string;
  status: string;
  current_period_end: string | null;
  polar_subscription_id: string;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: subs } = await sb
    .from("subscriptions")
    .select("tier, status, current_period_end, polar_subscription_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<SubscriptionRow[]>();

  const active = subs?.[0] ?? null;
  const isActive = active && ["active", "trialing"].includes(active.status);
  const proConfigured = !!POLAR_PRO_PRODUCT_ID;
  const teamConfigured = !!POLAR_TEAM_PRODUCT_ID;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Dashboard</div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Pay-as-you-go API access via Polar.sh. Upgrades take effect immediately; all of your
        active keys inherit the new tier.
      </p>

      {status === "success" && (
        <div className="mt-6 rounded-xl border border-emerald-300/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          Subscription confirmed. It can take a few seconds for your tier to flip — refresh in a
          moment if you don&rsquo;t see it below yet.
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Current subscription
        </h2>
        {isActive && active ? (
          <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-5 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            <div className="flex items-center gap-3">
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {tierLabel(active.tier)}
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {TIER_LIMITS[active.tier]?.toLocaleString() ?? "—"} requests/month
              </span>
            </div>
            {active.current_period_end && (
              <p className="mt-2 text-xs text-zinc-500">
                Renews {new Date(active.current_period_end).toLocaleDateString()}
              </p>
            )}
            <p className="mt-4 text-xs text-zinc-500">
              Manage payment method, invoices, or cancel from the{" "}
              <a
                href="https://polar.sh/portal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Polar customer portal ↗
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-5 text-sm text-zinc-600 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:text-zinc-400">
            You&rsquo;re on the <span className="font-medium text-zinc-900 dark:text-zinc-100">Free</span> tier — 500 requests/month.
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Upgrade
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlanCard
            tier="pro"
            name="Pro"
            price="$10.99 / mo"
            quota="10,000 requests/month"
            description="Production services, dashboards, internal tools."
            disabled={!proConfigured || active?.tier === "pro"}
            currentLabel={active?.tier === "pro" ? "Current plan" : null}
            ctaLabel={proConfigured ? "Upgrade to Pro" : "Coming soon"}
          />
          <PlanCard
            tier="team"
            name="Team"
            price="$49.99 / mo"
            quota="50,000 requests/month"
            description="Bulk analytics, market research, embedded data."
            disabled={!teamConfigured || active?.tier === "team"}
            currentLabel={active?.tier === "team" ? "Current plan" : null}
            ctaLabel={teamConfigured ? "Upgrade to Team" : "Coming soon"}
          />
        </div>
        {(!proConfigured || !teamConfigured) && (
          <p className="mt-4 text-xs text-zinc-500">
            Paid tiers are wired but waiting on Polar.sh product IDs (
            <span className="font-mono">POLAR_PRO_PRODUCT_ID</span> /{" "}
            <span className="font-mono">POLAR_TEAM_PRODUCT_ID</span>) in the deployment env. They
            unlock automatically once set.
          </p>
        )}
      </section>

      <section className="mt-10 text-xs text-zinc-500">
        <Link href="/dashboard/keys" className="hover:underline">
          ← Back to API keys
        </Link>
      </section>
    </main>
  );
}

function PlanCard({
  tier,
  name,
  price,
  quota,
  description,
  disabled,
  currentLabel,
  ctaLabel,
}: {
  tier: "pro" | "team";
  name: string;
  price: string;
  quota: string;
  description: string;
  disabled: boolean;
  currentLabel: string | null;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-5 dark:border-zinc-800/60 dark:bg-zinc-900/40">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{name}</h3>
        <div className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
          {price}
        </div>
      </div>
      <p className="mt-1 font-mono text-xs tabular-nums text-zinc-500">{quota}</p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
      <form action="/api/billing/checkout" method="post" className="mt-5">
        <input type="hidden" name="tier" value={tier} />
        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          {currentLabel ?? ctaLabel}
        </button>
      </form>
    </div>
  );
}
