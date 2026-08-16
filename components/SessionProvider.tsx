"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

const SessionContext = createContext<{ initialSignedIn: boolean }>({
  initialSignedIn: false,
});

function detectFromCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith("sb-") && c.includes("-auth-token"));
}

function subscribe(): () => void {
  return () => {};
}

function getServerSnapshot(): boolean {
  return false;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const initialSignedIn = useSyncExternalStore(subscribe, detectFromCookie, getServerSnapshot);
  return (
    <SessionContext.Provider value={{ initialSignedIn }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useInitialSignedIn(): boolean {
  return useContext(SessionContext).initialSignedIn;
}
