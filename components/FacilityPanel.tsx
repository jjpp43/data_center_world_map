"use client";

import { useState } from "react";
import Link from "next/link";
import type { Facility } from "@/lib/types";

const INFO: Record<string, string> = {
  "UPS redundancy":
    "Uninterruptible Power Supply topology. N+1 means there's one spare unit beyond what's needed, so a single failure doesn't drop power. 2N means a full duplicate, so even a full chain failure is survivable.",
  Networks:
    "Distinct ASNs (autonomous systems) with at least one port present at this facility. More networks means more interconnect options without leaving the building.",
  IXPs: "Internet Exchange Points hosted here. Joining one connects you to dozens or hundreds of networks at once through a shared switch fabric.",
};

type Props = {
  facility: Facility | null;
  onClose: () => void;
};

export function FacilityPanel({ facility, onClose }: Props) {
  const open = facility !== null;

  return (
    <aside
      aria-hidden={!open}
      className={`pointer-events-auto absolute inset-y-0 right-0 z-40 w-full max-w-md transform border-l border-zinc-200/60 bg-white/95 shadow-2xl backdrop-blur-lg transition-transform duration-300 ease-out dark:border-zinc-800/60 dark:bg-zinc-950/95 sm:w-[400px] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {facility && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-zinc-200/60 px-5 py-4 dark:border-zinc-800/60">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <span>{facility.operator}</span>
                {facility.code && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
                    {facility.code}
                  </span>
                )}
              </div>
              <h2 className="mt-0.5 truncate text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {facility.name}
              </h2>
              <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {facility.city}, {facility.country}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <CloseIcon />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-5">
            <StatusBadge status={facility.status} />

            <SpecList facility={facility} />

            <Link
              href={`/facility/${facility.slug}`}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
            >
              View full page
              <ArrowRightIcon />
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}

function Detail({
  label,
  children,
  info,
}: {
  label: string;
  children: React.ReactNode;
  info?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-zinc-100 pb-3 dark:border-zinc-900">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <span>{label}</span>
          {info && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={`More info about ${label}`}
              aria-expanded={open}
              className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] font-semibold transition-colors ${
                open
                  ? "border-blue-500/60 bg-blue-500/15 text-blue-600 dark:text-blue-300"
                  : "border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
              }`}
            >
              i
            </button>
          )}
        </dt>
        <dd className="text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {children}
        </dd>
      </div>
      {info && open && (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {info}
        </p>
      )}
    </div>
  );
}

function SpecList({ facility }: { facility: Facility }) {
  const cab = fmtCab(facility.min_cabinet_density_kw, facility.max_cabinet_density_kw);
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Power", value: facility.power_mw != null ? `${facility.power_mw} MW` : null },
    { label: "Space", value: facility.space_sqft != null ? `${facility.space_sqft.toLocaleString()} sqft` : null },
    { label: "Cabinet density", value: cab },
    { label: "Uptime tier", value: facility.tier },
    { label: "Uptime SLA", value: facility.uptime_sla },
    { label: "UPS redundancy", value: facility.ups_redundancy },
    { label: "PUE", value: facility.pue != null ? facility.pue.toString() : null },
    { label: "Year built", value: facility.year_built != null ? facility.year_built.toString() : null },
    { label: "Networks", value: facility.network_count > 0 ? facility.network_count.toLocaleString() : null },
    { label: "IXPs", value: facility.ix_count > 0 ? facility.ix_count.toLocaleString() : null },
  ];
  const visible = rows.filter((r) => r.value != null && r.value !== "");

  if (visible.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        No published specs.
      </div>
    );
  }

  return (
    <dl className="mt-6 space-y-3">
      {visible.map((r) => (
        <Detail key={r.label} label={r.label} info={INFO[r.label]}>
          {r.value}
        </Detail>
      ))}
    </dl>
  );
}

function fmtCab(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} kW`;
  return `${min ?? max} kW`;
}

function StatusBadge({ status }: { status: Facility["status"] }) {
  const cls =
    status === "operational"
      ? "bg-green-500/15 text-green-700 dark:text-green-300"
      : status === "under_construction"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300";
  const label = status === "under_construction" ? "Under construction" : status[0].toUpperCase() + status.slice(1);
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
