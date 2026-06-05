const REGIONAL_A = 0x1f1e6;
const A = "A".charCodeAt(0);

const nameLookup = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(code: string): string {
  if (!code) return "";
  return nameLookup?.of(code) ?? code;
}

export function countryFlag(code: string): string {
  if (code.length !== 2) return "";
  const upper = code.toUpperCase();
  const points = [
    REGIONAL_A + upper.charCodeAt(0) - A,
    REGIONAL_A + upper.charCodeAt(1) - A,
  ];
  return String.fromCodePoint(...points);
}
