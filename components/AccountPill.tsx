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

  return (
    <Link
      href={href}
      className="pointer-events-auto flex h-10 items-center rounded-full border border-zinc-200/60 bg-white/80 px-4 text-sm font-medium text-zinc-700 shadow-lg backdrop-blur-md transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {label}
    </Link>
  );
}
