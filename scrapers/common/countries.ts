import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json" with { type: "json" };

countries.registerLocale(en);

/**
 * Convert a country name or code to an ISO-3166-1 alpha-2 uppercase code.
 * Returns null when we cannot map it — never invent a code.
 */
export function toCountryCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return countries.isValid(upper) ? upper : null;
  }
  const code = countries.getAlpha2Code(trimmed, "en");
  return code ?? null;
}
