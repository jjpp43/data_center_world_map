import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cookie-aware Supabase client for authenticated server-side reads/writes
 * (dashboard, billing, auth callbacks). Wired with next/headers so RLS sees
 * the logged-in user. Kept in its own module so client components can import
 * `lib/supabase.ts` without dragging `next/headers` into the client bundle.
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
