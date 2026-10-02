export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s.name]));
const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));
const BY_SLUG = new Map(
  US_STATES.map((s) => [slugify(s.name), { code: s.code, name: s.name, slug: slugify(s.name) }]),
);

const DC_ALIASES = new Set([
  "dc",
  "d c",
  "washington dc",
  "washington d c",
  "district of columbia",
]);

export function isUsOnly(countries: string[]): boolean {
  return countries.length === 1 && countries[0] === "US";
}

export function usStateName(code: string): string {
  return BY_CODE.get(code.toUpperCase()) ?? code;
}

/** Canonical URL slug from a USPS code (`OH` → `ohio`). */
export function usStateSlug(code: string): string {
  return slugify(usStateName(code));
}

export function usCitySlug(city: string): string {
  return slugify(city);
}

export type UsStateRef = {
  code: string;
  name: string;
  slug: string;
  isCanonical: boolean;
};

/** Resolve `/countries/united-states/[state]` — name slug (canonical) or USPS alias. */
export function findUsStateByParam(param: string): UsStateRef | null {
  if (!param || !/^[a-zA-Z0-9-]+$/.test(param)) return null;
  const lower = param.toLowerCase();
  const named = BY_SLUG.get(lower);
  if (named) return { ...named, isCanonical: true };

  const code = normalizeUsState(param.replace(/-/g, " "));
  if (!code) return null;
  const name = usStateName(code);
  const slug = slugify(name);
  return { code, name, slug, isCanonical: slug === lower };
}

export function usStateHref(code: string): string {
  return `/countries/united-states/${usStateSlug(code)}`;
}

export function usCityHref(stateCode: string, citySlug: string): string {
  return `${usStateHref(stateCode)}/${citySlug}`;
}

export function usStateMapHref(code: string): string {
  return `/?country=US&state=${code.toUpperCase()}`;
}

/** Nested `/countries/[code]/[state]` is US-only. `us` 308s to `united-states`. */
export function isUsCountryParam(code: string): { isCanonical: boolean } | null {
  const lower = code.toLowerCase();
  if (lower === "united-states") return { isCanonical: true };
  if (lower === "us") return { isCanonical: false };
  return null;
}

export function normalizeUsState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (BY_CODE.has(upper)) return upper;

  const lead = /^([A-Z]{2})(?:\s|$)/.exec(upper);
  if (lead && BY_CODE.has(lead[1])) return lead[1];

  const folded = trimmed
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (DC_ALIASES.has(folded)) return "DC";
  return BY_NAME.get(folded) ?? null;
}
