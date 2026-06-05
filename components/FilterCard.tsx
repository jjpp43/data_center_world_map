"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { CloudProvider, Facility, Filters } from "@/lib/types";
import { countryFlag, countryName } from "@/lib/countries";

const QUICK_OPERATORS: Array<{ label: string; value: string }> = [
  { label: "Equinix", value: "Equinix, Inc." },
  { label: "Digital Realty", value: "Digital Realty" },
  { label: "DataBank", value: "DataBank, Ltd." },
  { label: "Cologix", value: "Cologix, Inc." },
  { label: "EdgeConneX", value: "EdgeConneX Inc." },
  { label: "Flexential", value: "Flexential Corp." },
  { label: "CyrusOne", value: "CyrusOne Inc." },
  { label: "TierPoint", value: "TierPoint, LLC" },
];

const CLOUD_PROVIDERS: Array<{ label: string; value: CloudProvider; color: string }> = [
  { label: "AWS", value: "aws", color: "#ff9d2e" },
  { label: "GCP", value: "gcp", color: "#a855f7" },
  { label: "Azure", value: "azure", color: "#3aa0e6" },
  { label: "Oracle", value: "oracle", color: "#ff5757" },
];

type Props = {
  facilities: Facility[];
  filters: Filters;
  onChange: (f: Filters) => void;
  providerFocus: CloudProvider | null;
  onProviderFocusChange: (p: CloudProvider | null) => void;
  visibleCount: number;
  totalCount: number;
  countLabel: string;
};


export function FilterCard({
  facilities,
  filters,
  onChange,
  providerFocus,
  onProviderFocusChange,
  visibleCount,
  totalCount,
  countLabel,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const operatorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of facilities) counts.set(f.operator, (counts.get(f.operator) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [facilities]);

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of facilities) counts.set(f.country, (counts.get(f.country) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [facilities]);

  return (
    <div className="pointer-events-auto absolute left-4 top-20 z-20 w-72 rounded-2xl border border-zinc-200/60 bg-white/80 shadow-lg backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/70">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        <span className="flex items-center gap-2">
          <FilterIcon /> Filters
        </span>
        <span className="flex items-center gap-2 text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
          <span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {visibleCount.toLocaleString()}
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">
              {" / "}
              {totalCount.toLocaleString()}
            </span>{" "}
            {countLabel}
          </span>
          <ChevronIcon collapsed={collapsed} />
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-4 border-t border-zinc-200/60 px-4 py-3 dark:border-zinc-800/60">
          <FilterSection label="Quick">
            <div className="flex flex-wrap gap-1">
              {QUICK_OPERATORS.map((op) => {
                const active = filters.operators.includes(op.value);
                return (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? filters.operators.filter((v) => v !== op.value)
                        : [...filters.operators, op.value];
                      onChange({ ...filters, operators: next });
                    }}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {CLOUD_PROVIDERS.map((cp) => {
                const active = providerFocus === cp.value;
                return (
                  <button
                    key={cp.value}
                    type="button"
                    onClick={() => onProviderFocusChange(active ? null : cp.value)}
                    style={
                      active
                        ? { backgroundColor: `${cp.color}30`, color: cp.color, boxShadow: `inset 0 0 0 1px ${cp.color}66` }
                        : undefined
                    }
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? ""
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: cp.color }}
                    />
                    {cp.label}
                  </button>
                );
              })}
            </div>
          </FilterSection>

          <FilterSection label="Operator">
            <MultiSelect
              options={operatorOptions}
              selected={filters.operators}
              onChange={(operators) => onChange({ ...filters, operators })}
              placeholder="Any operator"
            />
          </FilterSection>

          <FilterSection label="Country">
            <MultiSelect
              options={countryOptions}
              selected={filters.countries}
              onChange={(countries) => onChange({ ...filters, countries })}
              placeholder="Any country"
              renderOption={(code) => (
                <span className="flex items-center gap-2 truncate">
                  <span className="shrink-0 text-base leading-none">{countryFlag(code)}</span>
                  <span className="truncate">{countryName(code)}</span>
                </span>
              )}
              selectedSummary={(codes) =>
                codes.length === 1 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{countryFlag(codes[0])}</span>
                    <span className="truncate">{countryName(codes[0])}</span>
                  </span>
                ) : (
                  `${codes.length} countries`
                )
              }
            />
          </FilterSection>


        </div>
      )}
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  renderOption,
  selectedSummary,
}: {
  options: [string, number][];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  renderOption?: (value: string) => ReactNode;
  selectedSummary?: (selected: string[]) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const buttonLabel: ReactNode =
    selected.length === 0
      ? placeholder
      : selectedSummary
        ? selectedSummary(selected)
        : `${selected.length} selected`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-left text-sm text-zinc-800 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:border-zinc-700"
      >
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        <ChevronIcon collapsed={!open} />
      </button>
      {open && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          {options.map(([value, count]) => {
            const active = selected.includes(value);
            return (
              <li
                key={value}
                onClick={() => {
                  const next = active ? selected.filter((v) => v !== value) : [...selected, value];
                  onChange(next);
                }}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${active ? "bg-cyan-500/10" : ""}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-zinc-800 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={active}
                    readOnly
                    className="accent-cyan-400"
                  />
                  {renderOption ? renderOption(value) : <span className="truncate">{value}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-500">{count}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
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
      className={`transition-transform ${collapsed ? "" : "rotate-180"}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
