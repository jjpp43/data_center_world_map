import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { supabaseAuthServer } from "@/lib/supabase";
import { getTheme } from "@/lib/theme";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [sb, theme] = await Promise.all([supabaseAuthServer(), getTheme()]);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const email = user.email ?? user.user_metadata?.user_name ?? "Signed in";

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
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
                href="/dashboard/keys"
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                API keys
              </Link>
              <Link
                href="/dashboard/billing"
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Billing
              </Link>
              <Link
                href="/api"
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Docs
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
