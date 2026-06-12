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
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-xl shadow-sm ring-1 ring-zinc-900/80 dark:ring-zinc-700/80">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900">
          <div className="flex">
            {ORDER.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActive(lang)}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                  active === lang
                    ? "border-b-2 border-indigo-400 text-zinc-50"
                    : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {LABELS[lang]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            className="mr-2 rounded px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Copy code"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100">
          {sample[active]}
        </pre>
      </div>
    </div>
  );
}

/**
 * Static code block — same dark "editor" style as CodeTabs, no tabs.
 * Used for response examples.
 */
export function ResponseBlock({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {label && (
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 shadow-sm ring-1 ring-zinc-900/80 dark:ring-zinc-700/80">
        {children}
      </pre>
    </div>
  );
}

export function Snippet({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 shadow-sm ring-1 ring-zinc-900/80 dark:ring-zinc-700/80">
      {children}
    </pre>
  );
}
