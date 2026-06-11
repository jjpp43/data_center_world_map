import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Anon-key client with no session persistence. Use this for public reads
 * (map data, listings, RPC functions) — no auth context attached.
 */
export function supabaseServer() {
  if (!URL || !ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  }
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Service-role client. ONLY used by ingest scripts and other non-runtime code.
 * `npm run check:security` blocks any reference from app/components.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }
  return createClient(URL, key, {
    auth: { persistSession: false },
  });
}

/**
 * Browser-side client for 'use client' components — needed for signOut and
 * any client-initiated auth flow. Server actions handle most state changes.
 *
 * The cookie-aware server client (supabaseAuthServer) lives in
 * `lib/supabase-server.ts` so this file stays safe to import from client
 * components — `next/headers` would otherwise poison the client bundle.
 */
export function supabaseBrowser() {
  if (!URL || !ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  }
  return createBrowserClient(URL, ANON_KEY);
}
