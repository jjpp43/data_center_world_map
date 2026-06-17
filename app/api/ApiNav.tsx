"use client";

import { useEffect, useState } from "react";

export interface NavItem {
  id: string;
  label: string;
  children?: NavItem[];
}

export const NAV: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "quick-start", label: "Quick start" },
  { id: "authentication", label: "Authentication" },
  {
    id: "endpoints",
    label: "Endpoints",
    children: [
      { id: "ep-facilities", label: "Facilities list" },
      { id: "ep-facility", label: "Facility detail" },
      { id: "ep-operators", label: "Operators" },
      { id: "ep-countries", label: "Countries" },
      { id: "ep-cloud-regions", label: "Cloud regions" },
    ],
  },
  { id: "mcp", label: "MCP (AI tool access)" },
  { id: "conventions", label: "Conventions" },
  { id: "errors", label: "Errors & rate limits" },
  { id: "pricing", label: "Pricing" },
  { id: "versioning", label: "Versioning" },
];

function flatten(items: NavItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    out.push(it.id);
    if (it.children) out.push(...flatten(it.children));
  }
  return out;
}

export function ApiNav() {
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const ids = flatten(NAV);
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // Pick the top-most visible section
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 1] },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="API documentation sections"
      className="text-base"
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        Contents
      </div>
      <ul className="mt-3 space-y-0.5">
        {NAV.map((item, idx) => (
          <li key={item.id}>
            <NavLink
              id={item.id}
              label={item.label}
              number={idx + 1}
              active={active}
            />
            {item.children && (
              <ul className="mt-0.5 ml-9 space-y-0.5 border-l border-zinc-200/70 pl-3 dark:border-zinc-800/60">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <NavLink
                      id={child.id}
                      label={child.label}
                      active={active}
                      small
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavLink({
  id,
  label,
  number,
  active,
  small = false,
}: {
  id: string;
  label: string;
  number?: number;
  active: string;
  small?: boolean;
}) {
  const isActive = active === id;
  return (
    <a
      href={`#${id}`}
      className={`flex items-baseline gap-3 rounded px-2 py-1 transition-colors ${
        small ? "text-sm" : "text-base"
      } ${
        isActive
          ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
          : "text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
      }`}
    >
      {number != null && (
        <span
          className={`min-w-[1.5rem] font-mono text-xs tabular-nums ${
            isActive
              ? "text-indigo-500 dark:text-indigo-400"
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {String(number).padStart(2, "0")}
        </span>
      )}
      <span>{label}</span>
    </a>
  );
}
