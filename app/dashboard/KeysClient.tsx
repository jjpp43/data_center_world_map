"use client";

import { useEffect, useState } from "react";

/**
 * Renders the one-shot plaintext reveal banner after key creation.
 * The plaintext arrives via ?reveal=... query param; we strip it from the URL
 * on mount so it doesn't survive a refresh or get bookmarked.
 */
export function KeysClient({ reveal }: { reveal: string | null }) {
  const [shown, setShown] = useState(reveal);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!reveal) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("reveal");
    window.history.replaceState({}, "", url.toString());
  }, [reveal]);

  if (!shown) return null;

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
          {shown}
        </code>
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
