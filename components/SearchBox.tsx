"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Facility } from "@/lib/types";

type Props = {
  facilities: Facility[];
  onSelect: (slug: string) => void;
};

export function SearchBox({ facilities, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return facilities
      .filter((f) =>
        f.name.toLowerCase().includes(q) ||
        f.operator.toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q) ||
        f.country.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, facilities]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function selectAt(index: number) {
    const r = results[index];
    if (!r) return;
    onSelect(r.slug);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-full border border-zinc-200/60 bg-white/80 px-4 py-2 shadow-lg backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/70">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              selectAt(highlighted);
            } else if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search facilities, operators, cities…"
          className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <kbd className="hidden rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          /
        </kbd>
      </div>

      {open && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl border border-zinc-200/60 bg-white/95 shadow-xl backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/95">
          {results.map((r, i) => (
            <li
              key={r.slug}
              onMouseDown={(e) => {
                e.preventDefault();
                selectAt(i);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors ${
                i === highlighted
                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : "text-zinc-800 dark:text-zinc-200"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {r.operator} · {r.city}, {r.country}
                </div>
              </div>
              {r.power_mw != null && (
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {r.power_mw} MW
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 dark:text-zinc-400">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
