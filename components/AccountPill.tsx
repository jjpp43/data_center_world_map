"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

/**
 * Auth-aware pill for the TopBar. Renders "Sign in" by default (the visitor
 * state we want to optimize for) and swaps to "Dashboard" once the browser
 * client confirms a session. Subscribes to onAuthStateChange so signing out
 * from another tab reflects here without a refresh.
 */
export function AccountPill() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Default render (no session detected yet): "Sign in" — it's the more common
  // state and avoids a Dashboard-flash on first paint for unauthenticated users.
  const href = signedIn ? "/dashboard/keys" : "/login";
  const label = signedIn ? "Dashboard" : "Sign in";

  // Signed-out state is the conversion CTA — solid filled pill. Signed-in
  // state shifts to the same glass treatment as the rest of the TopBar so it
  // doesn't keep pulling the user's eye after they've already converted.
  const className = signedIn
    ? "pointer-events-auto flex h-10 items-center rounded-full border border-zinc-200/60 bg-white/80 px-4 text-sm font-medium text-zinc-700 shadow-lg backdrop-blur-md transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
    : "pointer-events-auto flex h-10 items-center gap-1.5 rounded-full bg-blue-600 px-4 text-sm font-medium text-white shadow-lg shadow-blue-600/20 ring-1 ring-blue-500/40 transition-colors hover:bg-blue-500 dark:bg-blue-500 dark:shadow-blue-500/20 dark:ring-blue-400/40 dark:hover:bg-blue-400";

  return (
    <Link href={href} className={className}>
      {label}
      {!signedIn && <span aria-hidden>→</span>}
    </Link>
  );
}
