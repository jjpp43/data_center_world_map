import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { supabaseAuthServer } from "@/lib/supabase-server";
import { TIER_LIMITS, generateApiKey, tierLabel } from "@/lib/api-keys";
import { KeysClient } from "./KeysClient";

export const metadata: Metadata = {
  title: "API keys",
  description: "Create and manage your datacenters.world API keys.",
  alternates: { canonical: "/dashboard/keys" },
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

  revalidatePath("/dashboard/keys");
  // Redirect with the plaintext key as a query param — it's stripped before
  // rendering the list and shown once at the top of the page.
  redirect(`/dashboard/keys?reveal=${encodeURIComponent(plaintext)}`);
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
  revalidatePath("/dashboard/keys");
}

export default async function KeysPage({
  searchParams,
}: {
  searchParams: Promise<{ reveal?: string }>;
}) {
  const { reveal } = await searchParams;
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await sb
    .from("api_keys")
    .select("id, name, key_prefix, tier, created_at, last_used_at, revoked_at, current_month_usage")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<KeyRow[]>();

  const keys = rows ?? [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Dashboard</div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Bearer-token credentials for <span className="font-mono">/api/v1/*</span>. Each key has its
        own monthly quota — free tier is{" "}
        <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
          {TIER_LIMITS.free.toLocaleString()}
        </span>{" "}
        requests/month. Need more?{" "}
        <a
          href="/dashboard/billing"
          className="text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          Upgrade to Pro or Team →
        </a>
      </p>

      <KeysClient reveal={reveal ?? null} />

      <section className="mt-8">
        <form action={createKey} className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/70 bg-white/60 p-4 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          <label className="flex-1 min-w-[200px] text-xs">
            <div className="mb-1 font-mono uppercase tracking-wider text-zinc-500">
              Name
            </div>
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
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {keys.length === 0 ? "No keys yet" : `Your keys (${keys.length})`}
        </h2>
        {keys.length > 0 && (
          <ul className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/70 bg-white/60 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
            {keys.map((k) => {
              const limit = TIER_LIMITS[k.tier] ?? TIER_LIMITS.free;
              const pct = Math.min(100, Math.round((k.current_month_usage / limit) * 100));
              const isRevoked = !!k.revoked_at;
              return (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${isRevoked ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-100"}`}>
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
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span className="font-mono">{k.key_prefix}</span>
                      <span>created {new Date(k.created_at).toLocaleDateString()}</span>
                      {k.last_used_at && <span>used {new Date(k.last_used_at).toLocaleDateString()}</span>}
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
