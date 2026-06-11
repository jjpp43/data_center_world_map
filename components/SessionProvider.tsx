"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Carries a cheap "is the visitor likely signed in?" hint from the server
 * (cookie presence) down to client components. AccountPill uses it as the
 * initial useState seed so signed-in users don't see a "Sign in" flash
 * before the browser client verifies the session.
 *
 * Not authoritative — the browser client still runs getSession() to confirm
 * and corrects this value if the cookie is stale.
 */

const SessionContext = createContext<{ initialSignedIn: boolean }>({
  initialSignedIn: false,
});

export function SessionProvider({
  initialSignedIn,
  children,
}: {
  initialSignedIn: boolean;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={{ initialSignedIn }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useInitialSignedIn(): boolean {
  return useContext(SessionContext).initialSignedIn;
}
