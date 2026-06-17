import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthServer } from "@/lib/supabase-server";

// Only allow same-origin relative paths after OAuth. Rejects
// absolute URLs ("https://attacker.com"), protocol-relative URLs
// ("//attacker.com"), and anything that would let an attacker stitch
// our OAuth flow into their phishing chain.
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  const sb = await supabaseAuthServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url),
    );
  }

  return NextResponse.redirect(new URL(next, req.url));
}
