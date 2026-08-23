import type { ReactNode } from "react";
import Link from "next/link";
import { AccountPill } from "./AccountPill";

export const sheetLink =
  "text-teal-800 underline underline-offset-4 decoration-teal-300/80 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-700 dark:hover:decoration-teal-300";

export function EditorialShell({
  active,
  wide = false,
  children,
}: {
  active?: "about" | "methodology" | "api";
  series?: string;
  plate?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full bg-white text-zinc-900 dark:bg-black dark:text-zinc-100">
      <EditorialHeader active={active} wide={wide} />
      <main className={`mx-auto px-6 py-12 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        {children}
      </main>
    </div>
  );
}

export function Stat({
  label,
  value,
  size = "md",
}: {
  label: string;
  value: string;
  size?: "hero" | "md" | "sm";
  live?: boolean;
}) {
  const valueClass =
    size === "hero"
      ? "mt-1 font-mono text-4xl tabular-nums tracking-tight"
      : size === "sm"
        ? "mt-0.5 font-mono text-lg tabular-nums"
        : "mt-1 font-mono text-2xl tabular-nums";
  return (
    <div>
      <div className="text-sm text-zinc-500">{label}</div>
      <div className={`${valueClass} text-teal-800 dark:text-teal-300`}>{value}</div>
    </div>
  );
}

export function SectionHeader({
  children,
  caption,
}: {
  number?: number | string;
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {children}
      </h2>
      {caption && <span className="shrink-0 text-sm text-zinc-500">{caption}</span>}
    </div>
  );
}

export function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-base tabular-nums text-teal-800 dark:text-teal-300">{value}</span>
      <span className="text-sm text-zinc-500">{label}</span>
    </div>
  );
}

export function Test({ n, title, tag }: { n: string; title: string; tag: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-4 shrink-0 font-mono text-sm text-teal-700 dark:text-teal-400">{n}</span>
      <div>
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-zinc-500">{tag}</div>
      </div>
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
    <tr>
      <td className="px-4 py-2.5 align-top font-medium text-zinc-900 dark:text-zinc-100">
        {category}
      </td>
      <td className="px-4 py-2.5 align-top whitespace-nowrap text-sm">
        {ok ? (
          <span className="text-teal-800 dark:text-teal-400">Include</span>
        ) : (
          <span className="text-rose-700 dark:text-rose-400">Exclude</span>
        )}
      </td>
      <td className="px-4 py-2.5 align-top text-sm leading-relaxed text-zinc-500">{notes}</td>
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
        <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-teal-800 hover:underline dark:text-teal-400"
            >
              <span>{name}</span>
              <ExternalArrow />
            </a>
          ) : (
            name
          )}
        </h3>
        {host && <div className="mt-0.5 font-mono text-xs text-zinc-500">{host}</div>}
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-500">{what}</p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-xl tabular-nums text-teal-800 dark:text-teal-300">{count}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{unit}</div>
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
    <li>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>
        <span className="font-mono text-xs tabular-nums text-zinc-500">{impact}</span>
        <span className="font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400">{effort}</span>
      </div>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-zinc-500">{children}</p>
    </li>
  );
}

export function RankedRow({
  rank,
  label,
  value,
  prefix,
}: {
  rank: number;
  label: string;
  value: number;
  count: number;
  maxCount: number;
  prefix?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="w-4 font-mono text-xs tabular-nums text-teal-700 dark:text-teal-400">{rank}</span>
      {prefix}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono text-xs tabular-nums text-zinc-500">
        {value.toLocaleString("en-US")}
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
      className="inline text-teal-600 dark:text-teal-500"
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
  wide = false,
}: {
  active?: "about" | "methodology" | "api";
  wide?: boolean;
}) {
  const link = (href: string, label: string, current: boolean) => (
    <Link
      href={href}
      className={`text-sm ${
        current
          ? "font-medium text-teal-800 dark:text-teal-400"
          : "text-zinc-500 hover:text-teal-800 dark:hover:text-teal-300"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div
        className={`mx-auto flex items-center justify-between gap-6 px-6 py-3 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
      >
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            datacenters.world
          </Link>
          <nav className="flex items-center gap-4">
            {link("/about", "About", active === "about")}
            {link("/methodology", "Methodology", active === "methodology")}
            {link("/api", "API", active === "api")}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-teal-800 dark:hover:text-teal-300"
          >
            Map
          </Link>
          <AccountPill />
        </div>
      </div>
    </header>
  );
}
