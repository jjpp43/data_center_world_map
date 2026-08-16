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
    <nav aria-label="API documentation sections">
      <div className="mb-3 text-xs font-medium text-zinc-500">On this page</div>
      <ul className="space-y-1">
        {NAV.map((item) => (
          <li key={item.id}>
            <NavLink id={item.id} label={item.label} active={active} />
            {item.children && (
              <ul className="mt-1 ml-3 space-y-1 border-l border-teal-200 pl-3 dark:border-teal-900">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <NavLink id={child.id} label={child.label} active={active} />
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
  active,
}: {
  id: string;
  label: string;
  active: string;
}) {
  const isActive = active === id;
  return (
    <a
      href={`#${id}`}
      className={`block text-sm ${
        isActive
          ? "font-medium text-teal-800 dark:text-teal-400"
          : "text-zinc-500 hover:text-teal-800 dark:hover:text-teal-300"
      }`}
    >
      {label}
    </a>
  );
}
