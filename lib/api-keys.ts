import { createHash, randomBytes } from "node:crypto";

const PREFIX = "dcw_";

/**
 * Generate a 32-byte URL-safe API key.
 * Returns the plaintext (shown to the user exactly once) and the sha256 hash
 * (what we persist for lookups). Format: `dcw_<43-char-base64url>`.
 */
export function generateApiKey() {
  const raw = randomBytes(32).toString("base64url");
  const plaintext = `${PREFIX}${raw}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const display_prefix = `${PREFIX}${raw.slice(0, 6)}…`;
  return { plaintext, hash, display_prefix };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export const TIER_LIMITS: Record<string, number> = {
  free: 500,
  pro: 10_000,
  team: 50_000,
  enterprise: 5_000_000,
};

// Anonymous (no Bearer) is also monthly per IP — the data isn't live, so
// cache catches the bulk of traffic and a daily window adds friction with
// no benefit. 500/mo keeps casual probing + AI citation usable while still
// putting authenticated Free (1k/mo) materially ahead.
export const ANONYMOUS_MONTHLY_LIMIT = 500;

export function tierLabel(tier: string): string {
  return tier[0].toUpperCase() + tier.slice(1);
}
