import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthServer } from "@/lib/supabase-server";
import { createCheckoutSession, productIdForTier, type PaidTier } from "@/lib/polar";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://datacenters.world";

export async function POST(req: NextRequest) {
  const sb = await supabaseAuthServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const tierRaw = form?.get("tier");
  const tier = tierRaw === "pro" || tierRaw === "team" ? (tierRaw as PaidTier) : null;
  if (!tier) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const productId = productIdForTier(tier);
  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Billing not configured yet. Server is missing POLAR_PRO_PRODUCT_ID / POLAR_TEAM_PRODUCT_ID.",
      },
      { status: 503 },
    );
  }

  try {
    const session = await createCheckoutSession({
      productId,
      customerEmail: user.email,
      successUrl: `${SITE}/dashboard/billing?status=success`,
      metadata: {
        user_id: user.id,
        tier,
      },
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
