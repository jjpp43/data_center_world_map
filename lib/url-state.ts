import type { CloudProvider, Filters } from "./types";

export type AppState = {
  filters: Filters;
  selectedSlug: string | null;
  theme: "dark" | "light";
  projection: "mercator" | "globe";
  cloudRegionsVisible: boolean;
  providerFocus: CloudProvider | null;
};

const VALID_PROVIDERS: CloudProvider[] = ["aws", "gcp", "azure", "oracle"];

export const DEFAULT_STATE: AppState = {
  filters: {
    operators: [],
    countries: ["US"],
  },
  selectedSlug: null,
  theme: "dark",
  projection: "globe",
  cloudRegionsVisible: true,
  providerFocus: null,
};

export function parseUrl(sp: URLSearchParams): AppState {
  // Bare URL (no query string) → apply documented defaults (country=US, etc.)
  // so a fresh visit lands on the US view instead of an empty-filter globe.
  // Once any param is set, respect exactly what's there.
  if ([...sp.keys()].length === 0) return DEFAULT_STATE;
  const next: AppState = {
    filters: {
      operators: csv(sp.get("op")),
      countries: csv(sp.get("country")).map((c) => c.toUpperCase()),
    },
    selectedSlug: sp.get("q") || null,
    theme: sp.get("theme") === "light" ? "light" : "dark",
    projection: sp.get("map") === "2d" ? "mercator" : "globe",
    cloudRegionsVisible: sp.get("clouds") !== "0",
    providerFocus: parseProvider(sp.get("focus")),
  };
  return next;
}

function parseProvider(s: string | null): CloudProvider | null {
  return VALID_PROVIDERS.find((p) => p === s) ?? null;
}

export function serializeUrl(state: AppState): string {
  const sp = new URLSearchParams();
  const f = state.filters;

  if (f.operators.length) sp.set("op", f.operators.join(","));
  if (f.countries.length) sp.set("country", f.countries.join(","));

  if (state.selectedSlug) sp.set("q", state.selectedSlug);
  if (state.theme === "light") sp.set("theme", "light");
  if (state.projection === "mercator") sp.set("map", "2d");
  if (!state.cloudRegionsVisible) sp.set("clouds", "0");
  if (state.providerFocus) sp.set("focus", state.providerFocus);

  return sp.toString();
}

function csv(s: string | null): string[] {
  return s ? s.split(",").filter(Boolean) : [];
}

