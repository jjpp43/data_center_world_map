"use client";

import { useState, type ReactNode } from "react";

export type Lang = "curl" | "javascript" | "python";

interface Sample {
  curl: string;
  javascript: string;
  python: string;
}

const LABELS: Record<Lang, string> = {
  curl: "cURL",
  javascript: "JavaScript",
  python: "Python",
};

const ORDER: Lang[] = ["javascript", "python", "curl"];

export function CodeTabs({
  sample,
  label,
}: {
  sample: Sample;
  label?: string;
}) {
  const [active, setActive] = useState<Lang>("javascript");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(sample[active]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      {label && (
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-200/70 bg-zinc-50/80 dark:border-zinc-800/70 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200/70 bg-zinc-50/40 px-2 dark:border-zinc-800/70 dark:bg-zinc-900/30">
          <div className="flex">
            {ORDER.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActive(lang)}
                className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  active === lang
                    ? "border-b-2 border-indigo-500 text-zinc-900 dark:text-zinc-100"
                    : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {LABELS[lang]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            className="mr-1 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Copy code"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
          {sample[active]}
        </pre>
      </div>
    </div>
  );
}

export function Snippet({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-200/70 bg-zinc-50/80 p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:text-zinc-200">
      {children}
    </pre>
  );
}
