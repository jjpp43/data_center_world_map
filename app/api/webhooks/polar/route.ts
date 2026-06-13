import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { tierForProductId, verifyWebhook } from "@/lib/polar";

/**
 * Polar.sh webhook receiver. Standard-Webhooks-signed.
 *
 * Subscription lifecycle we care about:
 *   - subscription.created / .updated / .active  → apply paid tier
 *   - subscription.canceled / .revoked           → roll back to free
 *
 * Anything else is logged and 200'd so Polar stops retrying.
 */

type PolarSubscription = {
  id: string;
  status: string;
  customer_id?: string;
  product_id?: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PolarEvent = {
  type: string;
  data: PolarSubscription;
};

const PAID_STATUSES = new Set(["active", "trialing"]);

async function applyEvent(event: PolarEvent) {
  const sub = event.data;
  const userIdRaw = sub.metadata?.user_id;
  const userId = typeof userIdRaw === "string" ? userIdRaw : null;
  if (!userId) {
    console.warn("[polar webhook] missing user_id in metadata", event.type, sub.id);
    return;
  }

  const tier = sub.product_id ? tierForProductId(sub.product_id) : null;
  if (!tier) {
    console.warn("[polar webhook] unrecognized product_id", sub.product_id);
    return;
  }

  // Map Polar event type → effective status fed to apply_user_tier
  const effectiveStatus = event.type.endsWith(".revoked")
    ? "revoked"
    : event.type.endsWith(".canceled")
      ? "canceled"
      : sub.status;

  const sb = supabaseAdmin();
  const { error } = await sb.rpc("upsert_subscription_and_apply_tier", {
    p_polar_subscription_id: sub.id,
    p_polar_customer_id: sub.customer_id ?? "",
    p_polar_product_id: sub.product_id ?? "",
    p_user_id: userId,
    p_tier: tier,
    p_status: effectiveStatus,
    p_current_period_end: sub.current_period_end ?? null,
    p_current_period_start: sub.current_period_start ?? null,
  });
  if (error) {
    console.error("[polar webhook] RPC error", error);
    throw new Error(error.message);
  }
  console.log(
    "[polar webhook]",
    event.type,
    "→",
    { user_id: userId, tier, effective_status: effectiveStatus },
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let event: PolarEvent;
  try {
    event = (await verifyWebhook(rawBody, {
      id: req.headers.get("webhook-id"),
      timestamp: req.headers.get("webhook-timestamp"),
      signature: req.headers.get("webhook-signature"),
    })) as PolarEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : "verification failed";
    console.error("[polar webhook] verify failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!event?.type) {
    return NextResponse.json({ error: "Missing event type" }, { status: 400 });
  }

  // Subscription lifecycle events: apply tier changes
  if (event.type.startsWith("subscription.")) {
    const sub = event.data;
    const interesting =
      PAID_STATUSES.has(sub.status) ||
      event.type.endsWith(".canceled") ||
      event.type.endsWith(".revoked") ||
      event.type.endsWith(".updated");

    if (interesting) {
      try {
        await applyEvent(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : "apply failed";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    } else {
      console.log("[polar webhook] ignored:", event.type, sub.status);
    }
  } else {
    console.log("[polar webhook] non-subscription event:", event.type);
  }

  return NextResponse.json({ received: true });
}
