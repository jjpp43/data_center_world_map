"use client";

import { useEffect, useState } from "react";

export function KeysClient({ reveal }: { reveal: string | null }) {
  const [shown, setShown] = useState(reveal);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!reveal) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("reveal");
    window.history.replaceState({}, "", url.toString());
  }, [reveal]);

  if (!shown) return null;

  const masked = maskKey(shown);

  async function copy() {
    if (!shown) return;
    await navigator.clipboard.writeText(shown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-6 rounded-2xl border border-emerald-300/70 bg-emerald-50/70 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/30">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
          New key — save it now
        </div>
        <button
          type="button"
          onClick={() => setShown(null)}
          className="text-xs text-emerald-700 hover:underline dark:text-emerald-300"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-100/70">
        We only show the full key once. Copy it now — you won&rsquo;t be able to see it again.
      </p>
      <div className="mt-3 flex items-stretch gap-2">
        <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
          {visible ? shown : masked}
        </code>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide key" : "Reveal key"}
          aria-pressed={visible}
          className="rounded-lg border border-emerald-300/60 bg-white px-3 py-2 text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800/40 dark:bg-zinc-950 dark:text-emerald-300 dark:hover:bg-zinc-900"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function maskKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}${"•".repeat(Math.max(8, key.length - 12))}${key.slice(-4)}`;
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 4.21-5.36" />
      <path d="M22 12s-1.18 2.39-3.36 4.36" />
      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7" />
      <path d="m1 1 22 22" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
    </svg>
  );
}
