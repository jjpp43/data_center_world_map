"use client";

import { useState, useTransition } from "react";

export function KeyNameEditor({
  id,
  name,
  canEdit,
  action,
}: {
  id: string;
  name: string;
  canEdit: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5">
        <span
          className={`font-medium ${
            canEdit
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-400 line-through"
          }`}
        >
          {name}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setValue(name);
              setEditing(true);
            }}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Rename key"
            title="Rename"
          >
            <PencilIcon />
          </button>
        )}
      </span>
    );
  }

  function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setValue(name);
      setEditing(false);
      return;
    }
    const fd = new FormData();
    fd.set("id", id);
    fd.set("name", trimmed);
    startTransition(async () => {
      await action(fd);
      setEditing(false);
    });
  }

  function cancel() {
    setValue(name);
    setEditing(false);
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        disabled={pending}
        maxLength={60}
        className="w-44 rounded border border-zinc-300/70 bg-white px-2 py-1 text-sm font-medium text-zinc-900 outline-none focus:border-indigo-500 disabled:opacity-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
      >
        {pending ? "Saving" : "Save"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
      >
        Cancel
      </button>
    </span>
  );
}

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}
