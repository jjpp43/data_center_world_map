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
        <div className="mb-2 text-xs font-medium text-zinc-500">
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950">
          <div className="flex">
            {ORDER.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActive(lang)}
                className={`px-3 py-2 text-xs transition-colors ${
                  active === lang
                    ? "text-teal-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {LABELS[lang]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            className={`mr-2 inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
              copied
                ? "text-teal-300"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
            aria-label={copied ? "Copied" : "Copy code"}
            title={copied ? "Copied" : "Copy"}
          >
            {copied ? <CheckIcon /> : <ClipboardIcon />}
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
        <div className="mb-2 text-xs font-medium text-zinc-500">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100">
        {children}
      </pre>
    </div>
  );
}

export function Snippet({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100">
      {children}
    </pre>
  );
}

function ClipboardIcon() {
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
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
