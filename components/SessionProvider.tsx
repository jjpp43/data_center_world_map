"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * "Is the visitor likely signed in?" hint, derived from cookie presence on
 * mount. AccountPill uses it as the initial useState seed so signed-in users
 * don't see a "Sign in" flash before the browser client verifies the session.
 *
 * Reads cookies client-side so the root layout stays static (no cookies() call
 * server-side → enables ISR on pages beneath it). Not authoritative; the
 * browser client still runs getSession() to confirm and corrects if stale.
 */

const SessionContext = createContext<{ initialSignedIn: boolean }>({
  initialSignedIn: false,
});

function detectFromCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith("sb-") && c.includes("-auth-token"));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [initialSignedIn] = useState<boolean>(() => detectFromCookie());
  return (
    <SessionContext.Provider value={{ initialSignedIn }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useInitialSignedIn(): boolean {
  return useContext(SessionContext).initialSignedIn;
}
