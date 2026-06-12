"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_INGEST_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_UI_HOST = POSTHOG_INGEST_HOST.includes("eu")
  ? "https://eu.posthog.com"
  : "https://us.posthog.com";

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return;
    if (!posthog.__loaded) {
      posthog.init(POSTHOG_KEY, {
        api_host: "/ingest",
        ui_host: POSTHOG_UI_HOST,
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        capture_pageview: false,
        autocapture: true,
        disable_session_recording: false,
      });
    }

    const sb = supabaseBrowser();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      const u = data.session?.user;
      if (u) posthog.identify(u.id, { email: u.email });
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      if (u) {
        posthog.identify(u.id, { email: u.email });
      } else if (event === "SIGNED_OUT") {
        posthog.reset();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export function PostHogPageView() {
  const pathname = usePathname();
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined" || !posthog.__loaded) return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname]);
  return null;
}

export function captureEvent(event: string, props?: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture(event, props);
}
