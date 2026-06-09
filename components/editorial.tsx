import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  size = "md",
  live = false,
}: {
  label: string;
  value: string;
  size?: "hero" | "md" | "sm";
  live?: boolean;
}) {
  if (size === "hero") {
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-md transition-colors dark:border-zinc-800/70 dark:bg-zinc-950/40">
        <div
          aria-hidden
          className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-500/[0.08] blur-2xl transition-opacity group-hover:bg-indigo-500/[0.14]"
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
            {live && (
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 live-dot" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
            )}
            <span>{label}</span>
          </div>
          <div className="mt-3 font-mono text-[3.25rem] font-light leading-none tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {value}
          </div>
        </div>
      </div>
    );
  }
  if (size === "sm") {
    return (
      <div className="rounded-lg border border-zinc-200/70 bg-white/60 px-3 py-2 dark:border-zinc-800/70 dark:bg-zinc-900/30">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </div>
        <div className="mt-0.5 font-mono text-lg tabular-nums text-zinc-800 dark:text-zinc-200">
          {value}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-4 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-900/30">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

export function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-base tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

export function Test({ n, title, tag }: { n: string; title: string; tag: string }) {
  return (
    <div className="group relative border-l border-zinc-200 pl-4 transition-colors hover:border-indigo-500 dark:border-zinc-800 dark:hover:border-indigo-400">
      <div className="absolute -left-px top-0 h-6 w-px bg-indigo-500/0 transition-colors group-hover:bg-indigo-500 dark:group-hover:bg-indigo-400" />
      <div className="font-mono text-[10px] tracking-[0.25em] text-indigo-600/80 dark:text-indigo-400/70">
        {n}
      </div>
      <div className="mt-1.5 text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{tag}</div>
    </div>
  );
}

export function MatrixRow({
  ok,
  category,
  notes,
}: {
  ok?: boolean;
  no?: boolean;
  category: string;
  notes: string;
}) {
  return (
    <tr className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          {ok ? (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          ) : (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
          )}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{category}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.15em] ${
            ok ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"
          }`}
        >
          {ok ? "Include" : "Exclude"}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-sm text-zinc-600 dark:text-zinc-400">{notes}</td>
    </tr>
  );
}

export function Source({
  name,
  count,
  unit,
  what,
  url,
}: {
  name: string;
  count: string;
  unit: string;
  what: string;
  url: string | null;
}) {
  let host: string | null = null;
  if (url) {
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
  }

  return (
    <div className="grid grid-cols-[1fr_auto] gap-6 py-5">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-300"
            >
              <span>{name}</span>
              <ExternalArrow />
            </a>
          ) : (
            name
          )}
        </h3>
        {host && (
          <div className="mt-0.5 font-mono text-[10px] tracking-wide text-zinc-500">{host}</div>
        )}
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {what}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-2xl font-light tabular-nums text-zinc-900 dark:text-zinc-100">
          {count}
        </div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
          {unit}
        </div>
      </div>
    </div>
  );
}

export function Gap({
  title,
  impact,
  effort,
  children,
}: {
  title: string;
  impact: string;
  effort: string;
  children: ReactNode;
}) {
  return (
    <li className="relative pl-6">
      <span
        aria-hidden
        className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-amber-500/70 ring-4 ring-amber-500/10 dark:bg-amber-400/70 dark:ring-amber-400/10"
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">
          {impact}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
          {effort}
        </span>
      </div>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </p>
    </li>
  );
}

export function RankedRow({
  rank,
  label,
  value,
  count,
  maxCount,
  prefix,
}: {
  rank: number;
  label: string;
  value: number;
  count: number;
  maxCount: number;
  prefix?: ReactNode;
}) {
  const pct = maxCount > 0 ? Math.max(2, (count / maxCount) * 100) : 0;
  return (
    <li className="group flex items-center gap-3 py-1.5 text-sm">
      <span className="w-5 font-mono text-[10px] tabular-nums text-zinc-400">
        {String(rank).padStart(2, "0")}
      </span>
      {prefix}
      <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200">{label}</span>
      <div className="hidden h-1 w-20 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 sm:block">
        <div
          className="h-full bg-indigo-500/60 transition-colors group-hover:bg-indigo-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-xs tabular-nums text-zinc-500">
        {value.toLocaleString()}
      </span>
    </li>
  );
}

export function ExternalArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline text-zinc-500"
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function ArrowLeftIcon() {
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
      <path d="m12 19-7-7 7-7M19 12H5" />
    </svg>
  );
}

export function EditorialHeader({
  active,
}: {
  active: "about" | "methodology" | "api";
}) {
  const link = (href: string, label: string, current: boolean) => (
    <a
      href={href}
      className={`text-sm font-medium transition-colors ${
        current
          ? "text-zinc-900 dark:text-zinc-100"
          : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </a>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200/60 bg-white/75 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/75">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3.5">
        <div className="flex items-center gap-5">
          <a
            href="/"
            className="flex items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <ArrowLeftIcon /> Map
          </a>
          <nav className="flex items-center gap-5">
            {link("/about", "About", active === "about")}
            {link("/methodology", "Methodology", active === "methodology")}
            {link("/api", "API", active === "api")}
          </nav>
        </div>
        <a href="/" className="text-sm font-semibold tracking-tight">
          datacenters<span className="text-blue-500 dark:text-blue-400">.world</span>
        </a>
      </div>
    </header>
  );
}
