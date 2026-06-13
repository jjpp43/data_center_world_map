import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAuthServer } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage your datacenters.world API keys.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

async function startGithubLogin() {
  "use server";
  const sb = await supabaseAuthServer();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${SITE}/auth/callback?next=/dashboard` },
  });
  if (error) throw error;
  if (data.url) redirect(data.url);
}

export default async function LoginPage() {
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            ← Back to map
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-md flex-col items-stretch px-6 py-20">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Account</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Create and manage API keys for the public dataset. Free tier is 1,000 requests/month —
          no card required.
        </p>

        <form action={startGithubLogin} className="mt-8">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <GithubMark />
            Continue with GitHub
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          We only use your GitHub login for authentication. No repo access requested.
        </p>
      </main>
    </div>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path
        d="M12 .5a11.5 11.5 0 0 0-3.64 22.4c.58.11.79-.25.79-.55v-2.05c-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.27-1.7-1.27-1.7-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.3 1.18-3.1-.12-.29-.51-1.46.1-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.84 1.18 3.1 0 4.44-2.69 5.4-5.25 5.69.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.79.55A11.5 11.5 0 0 0 12 .5z"
      />
    </svg>
  );
}
