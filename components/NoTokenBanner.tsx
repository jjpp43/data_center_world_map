"use client";

export function NoTokenBanner() {
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-md rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-5 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-amber-100">No Mapbox token configured</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-100/80">
              Add{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
                NEXT_PUBLIC_MAPBOX_TOKEN
              </code>{" "}
              to{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">.env.local</code>{" "}
              and restart the dev server.
            </p>
            <a
              href="https://account.mapbox.com/access-tokens/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-amber-200 underline decoration-amber-400/40 underline-offset-4 hover:text-amber-100 hover:decoration-amber-300"
            >
              Get a free token →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
