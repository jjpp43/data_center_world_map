"use client";

import { useState } from "react";

export function InfoToggle({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
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
      {open && (
        <span className="block w-full pt-2 text-xs font-normal leading-relaxed normal-case tracking-normal text-zinc-600 dark:text-zinc-400">
          {text}
        </span>
      )}
    </>
  );
}
