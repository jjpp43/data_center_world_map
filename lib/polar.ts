/**
 * Polar.sh client helpers. Raw fetch — no SDK — so we keep the dependency
 * surface flat and the implementation auditable. Polar's Checkout API takes
 * a product_id + success_url + metadata and returns a hosted-checkout URL;
 * their webhooks follow the Standard Webhooks spec (webhook-id /
 * webhook-timestamp / webhook-signature headers, HMAC-SHA256, v1,<sig> format).
 */

const POLAR_API_BASE =
  process.env.POLAR_API_BASE ?? "https://api.polar.sh";

export const POLAR_PRO_PRODUCT_ID = process.env.POLAR_PRO_PRODUCT_ID;
export const POLAR_TEAM_PRODUCT_ID = process.env.POLAR_TEAM_PRODUCT_ID;

export type PaidTier = "pro" | "team";

export function productIdForTier(tier: PaidTier): string | null {
  return tier === "pro" ? POLAR_PRO_PRODUCT_ID ?? null : POLAR_TEAM_PRODUCT_ID ?? null;
}

export function tierForProductId(productId: string): PaidTier | null {
  if (productId === POLAR_PRO_PRODUCT_ID) return "pro";
  if (productId === POLAR_TEAM_PRODUCT_ID) return "team";
  return null;
}

interface CheckoutInput {
  productId: string;
  customerEmail: string;
  successUrl: string;
  metadata: Record<string, string>;
}

interface CheckoutResponse {
  id: string;
  url: string;
}

/**
 * Create a Polar Checkout session. Returns the URL the browser should visit.
 * Throws if POLAR_ACCESS_TOKEN is missing — the caller surfaces a friendlier
 * "billing not configured yet" error to end users.
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResponse> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error("POLAR_ACCESS_TOKEN missing");

  const res = await fetch(`${POLAR_API_BASE}/v1/checkouts/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      product_id: input.productId,
      success_url: input.successUrl,
      customer_email: input.customerEmail,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Polar checkout failed (${res.status}): ${text}`);
  }
  return (await res.json()) as CheckoutResponse;
}

// ────────────────────────────────────────────────────────────────────────────
// Webhook signature verification (Standard Webhooks)
// ────────────────────────────────────────────────────────────────────────────

const TOLERANCE_SECONDS = 5 * 60;

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a Standard-Webhooks–style signature. Polar may strip the `whsec_`
 * prefix on the secret you paste in the dashboard; we tolerate both forms.
 * Returns the parsed JSON payload on success, throws on any failure.
 */
export async function verifyWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): Promise<unknown> {
  const rawSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!rawSecret) throw new Error("POLAR_WEBHOOK_SECRET missing");
  const secret = rawSecret.startsWith("whsec_") ? rawSecret.slice("whsec_".length) : rawSecret;

  if (!headers.id || !headers.timestamp || !headers.signature) {
    throw new Error("missing standard-webhooks headers");
  }

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) throw new Error("invalid webhook timestamp");
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > TOLERANCE_SECONDS) throw new Error("webhook timestamp out of tolerance");

  // Some senders base64-encode the raw secret; svix-compatible verifiers
  // accept the raw string. Match the simpler raw-string form first.
  const message = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = await hmacSha256Base64(secret, message);
  const expectedTagged = `v1,${expected}`;

  // Polar can send multiple signatures whitespace-separated, any one of
  // which is acceptable.
  const candidates = headers.signature.split(/\s+/);
  const ok = candidates.some(
    (c) => timingSafeEqual(c, expectedTagged) || timingSafeEqual(c.replace(/^v1,/, ""), expected),
  );
  if (!ok) throw new Error("signature mismatch");

  return JSON.parse(rawBody);
}
