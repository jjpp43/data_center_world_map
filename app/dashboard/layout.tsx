import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { supabaseAuthServer } from "@/lib/supabase-server";

// Auth-gated account area — keep out of the index (thin to crawlers, redirects
// to /login when signed out). follow:false since there's nothing to crawl.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const email = user.email ?? user.user_metadata?.user_name ?? "Signed in";

  return (
    <div
      className="min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              ← Map
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/api"
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                API docs
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-zinc-500 sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-full border border-zinc-200/70 bg-white/80 px-3 py-1 text-zinc-600 hover:text-zinc-900 dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
