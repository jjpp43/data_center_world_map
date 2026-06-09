import { createClient } from "@supabase/supabase-js";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
 * Cookie-aware server client for authenticated routes (dashboard, settings).
 * Reads + writes the Supabase auth cookies via next/headers so RLS picks up
 * the logged-in user.
 */
export async function supabaseAuthServer() {
  if (!URL || !ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  }
  const cookieStore = await cookies();
  return createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const c of toSet) cookieStore.set(c.name, c.value, c.options);
        } catch {
          // Server Component reads call setAll — Next.js disallows writing
          // cookies there. Middleware/Route Handlers re-set the session.
        }
      },
    },
  });
}

/**
 * Browser-side client for 'use client' components — needed for signOut and
 * any client-initiated auth flow. Server actions handle most state changes.
 */
export function supabaseBrowser() {
  if (!URL || !ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
  }
  return createBrowserClient(URL, ANON_KEY);
}
