"use client";

import Link from "next/link";
import { SearchBox } from "./SearchBox";
import { AccountPill } from "./AccountPill";
import type { Facility } from "@/lib/types";

type Props = {
  facilities: Facility[];
  onSelect: (slug: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

export function TopBar({ facilities, onSelect, theme, onToggleTheme }: Props) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-4 px-4 py-3">
      <div className="pointer-events-auto flex items-center rounded-full border border-zinc-200/60 bg-white/80 px-4 py-2 shadow-lg backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/70">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          datacenters
          <span className="text-blue-500">.world</span>
        </Link>
      </div>

      <nav className="pointer-events-auto flex items-center gap-4 rounded-full border border-zinc-200/60 bg-white/80 px-4 py-2 shadow-lg backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/70">
        <Link
          href="/about"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          About
        </Link>
        <Link
          href="/methodology"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Methodology
        </Link>
        <Link
          href="/api"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          API
        </Link>
      </nav>

      <div className="pointer-events-auto flex-1 max-w-xl">
        <SearchBox facilities={facilities} onSelect={onSelect} />
      </div>

      <button
        type="button"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/60 bg-white/80 text-zinc-700 shadow-lg backdrop-blur-md transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      <AccountPill />
    </header>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
