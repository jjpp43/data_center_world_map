"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Facility } from "@/lib/types";
import { countryFlag, countryName } from "@/lib/countries";

const PAGE_SIZE = 30;

const QUICK_COUNTRIES = ["US", "DE", "GB", "FR", "NL", "JP", "SG", "AU"];

type Props = {
  facilities: Facility[];
};

export function MobileHome({ facilities }: Props) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return facilities.filter((f) => {
      if (country && f.country !== country) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.operator.toLowerCase().includes(q) ||
        (f.code ?? "").toLowerCase().includes(q) ||
        f.city.toLowerCase().includes(q)
      );
    });
  }, [facilities, query, country]);

  const sorted = useMemo(
    () =>
      [...visible].sort((a, b) => (b.network_count ?? 0) - (a.network_count ?? 0)),
    [visible],
  );
  const showing = sorted.slice(0, page * PAGE_SIZE);
  const hasMore = sorted.length > showing.length;

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/85 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/85">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-base font-semibold tracking-tight">
              datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
            </Link>
            <nav className="flex gap-4 text-xs font-medium text-zinc-500">
              <Link href="/about">About</Link>
              <Link href="/methodology">Methodology</Link>
            </nav>
          </div>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-zinc-500">
            Mobile · list view
          </p>
        </div>
        <div className="border-t border-zinc-200/70 bg-white/85 px-4 py-3 dark:border-zinc-800/60 dark:bg-zinc-950/85">
          <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <SearchIcon />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search facilities, operators, codes…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <CloseIcon />
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-1 text-xs">
            <Chip active={country === null} onClick={() => setCountry(null)}>
              All countries
            </Chip>
            {QUICK_COUNTRIES.map((cc) => (
              <Chip
                key={cc}
                active={country === cc}
                onClick={() => setCountry((c) => (c === cc ? null : cc))}
              >
                <span>{countryFlag(cc)}</span>
                <span>{cc}</span>
              </Chip>
            ))}
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        <div className="mb-3 text-xs tabular-nums text-zinc-500">
          {sorted.length.toLocaleString()} facilities
          {country && ` in ${countryName(country) ?? country}`}
          {query && ` matching “${query}”`}
        </div>

        {showing.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
            No facilities match.
          </div>
        ) : (
          <ul className="space-y-2">
            {showing.map((f) => (
              <li key={f.slug}>
                <Link
                  href={`/facility/${f.slug}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700 dark:active:bg-zinc-800"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        <span className="truncate">{f.operator}</span>
                        {f.code && (
                          <span className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[9px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {f.code}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {f.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                        <span>{countryFlag(f.country)}</span>
                        <span>{f.city}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] tabular-nums text-zinc-400">
                      {f.network_count > 0 && (
                        <div>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">
                            {f.network_count.toLocaleString()}
                          </span>{" "}
                          ASNs
                        </div>
                      )}
                      {f.ix_count > 0 && (
                        <div>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">
                            {f.ix_count}
                          </span>{" "}
                          IXPs
                        </div>
                      )}
                      {f.power_mw != null && (
                        <div>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">
                            {f.power_mw}
                          </span>{" "}
                          MW
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Show more ({(sorted.length - showing.length).toLocaleString()} remaining)
          </button>
        )}

        <p className="mt-8 max-w-prose text-xs leading-relaxed text-zinc-500">
          datacenters.world is desktop-first by design — the full interactive map experience
          uses a 2D/3D globe with filters, focus modes, and clustering. On mobile we offer this
          search-first list. For the full experience, open this site on a larger screen.
        </p>
      </main>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-blue-500 text-white"
          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
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
      className="shrink-0 text-zinc-500"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon() {
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
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
