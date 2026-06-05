"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "dcw-hint-seen-v1";

type Props = {
  facilityCount: number;
  dismissOnSlug: string | null;
};

export function FirstRunHint({ facilityCount, dismissOnSlug }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    if (facilityCount === 0) return;
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [facilityCount]);

  useEffect(() => {
    if (visible && dismissOnSlug) dismiss();
  }, [dismissOnSlug, visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2">
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-zinc-200/60 bg-white/90 px-4 py-2 text-sm text-zinc-700 shadow-xl backdrop-blur-md transition-opacity dark:border-zinc-800/60 dark:bg-zinc-950/80 dark:text-zinc-200"
        style={{ animation: "dcw-hint-fade 0.4s ease-out" }}
      >
        <span className="font-mono text-xs tabular-nums text-blue-500 dark:text-blue-400">
          {facilityCount.toLocaleString()}
        </span>
        <span>data centers worldwide. Click any dot for details, scroll to zoom.</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss hint"
          className="ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100"
        >
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
        </button>
      </div>
      <style>{`
        @keyframes dcw-hint-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
