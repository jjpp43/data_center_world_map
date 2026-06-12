"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useInitialSignedIn } from "./SessionProvider";

/**
 * Auth-aware pill for the TopBar.
 *
 * Signed-out: solid white CTA link → /login.
 * Signed-in:  glass pill that opens a dropdown menu (Dashboard, Billing,
 *             Sign out). Click-outside and Esc close the menu.
 *
 * Initial state is seeded from a cookie-presence hint set by the root layout
 * so returning visitors don't get a "Sign in" flash before the browser client
 * verifies the session. The browser client still runs onAuthStateChange to
 * keep the UI honest across tabs.
 */
export function AccountPill() {
  const initial = useInitialSignedIn();
  const [signedIn, setSignedIn] = useState<boolean>(initial);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-zinc-900 shadow-lg ring-1 ring-zinc-900/10 transition-colors hover:bg-zinc-50"
      >
        Sign in
        <span aria-hidden>→</span>
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-300/80 bg-white/95 px-4 text-sm font-medium text-zinc-700 shadow-lg backdrop-blur-md transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Account
        <Chevron open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/90 shadow-lg backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/90"
        >
          <MenuLink href="/dashboard" onClick={() => setOpen(false)}>
            Dashboard
          </MenuLink>
          <div className="border-t border-zinc-200/70 dark:border-zinc-800/70" />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100/70 dark:text-zinc-300 dark:hover:bg-zinc-900/70"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block px-4 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100/70 dark:text-zinc-300 dark:hover:bg-zinc-900/70"
    >
      {children}
    </Link>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
