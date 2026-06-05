/**
 * Deterministic kebab-case slugify. ASCII only.
 * Strips diacritics, lowercases, replaces non-alphanumerics with dashes,
 * collapses dashes, trims edge dashes.
 */
export function slugify(...parts: Array<string | null | undefined>): string {
  const joined = parts.filter((p): p is string => !!p && p.trim().length > 0).join("-");
  return joined
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
