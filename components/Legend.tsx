"use client";

import { useState } from "react";

type Props = {
  cloudRegionsVisible: boolean;
  onCloudRegionsToggle: (v: boolean) => void;
};

export function Legend({ cloudRegionsVisible, onCloudRegionsToggle }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20">
      {open ? (
        <div className="rounded-2xl border border-zinc-300/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/70">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-2 flex w-full items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            <span>Legend</span>
            <CloseIcon />
          </button>
          <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
            <li className="flex items-center gap-2">
              <Dot color="#4ade80" />
              Operational
            </li>
            <li className="flex items-center gap-2">
              <Dot color="#fbbf24" />
              Under construction
            </li>
            <li className="flex items-center gap-2">
              <Dot color="#94a3b8" />
              Planned
            </li>
          </ul>

          <div className="mt-3 border-t border-zinc-200/60 pt-2 dark:border-zinc-800/60">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={cloudRegionsVisible}
                onChange={(e) => onCloudRegionsToggle(e.target.checked)}
                className="accent-cyan-400"
              />
              <span>Cloud regions</span>
            </label>
            {cloudRegionsVisible && (
              <ul className="mt-1.5 ml-6 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                <li className="flex items-center gap-2">
                  <Dot color="#ff9d2e" />
                  AWS
                </li>
                <li className="flex items-center gap-2">
                  <Dot color="#a855f7" />
                  Google Cloud
                </li>
                <li className="flex items-center gap-2">
                  <Dot color="#3aa0e6" />
                  Azure
                </li>
                <li className="flex items-center gap-2">
                  <Dot color="#ff5757" />
                  Oracle Cloud
                </li>
              </ul>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-zinc-300/80 bg-white/95 px-3 py-2 text-xs font-medium text-zinc-700 shadow-lg backdrop-blur-md transition-colors hover:bg-white dark:border-zinc-800/60 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:bg-zinc-900"
          aria-label="Open legend"
        >
          <span className="flex -space-x-0.5">
            <Dot color="#4ade80" />
            <Dot color="#fbbf24" />
            <Dot color="#94a3b8" />
            {cloudRegionsVisible && <Dot color="#3aa0e6" />}
          </span>
          <span>Legend</span>
        </button>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}, 0 0 12px ${color}80`,
      }}
    />
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
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
