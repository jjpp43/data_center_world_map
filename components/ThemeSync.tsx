"use client";

import { useLayoutEffect, useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";

const THEME_BOOTSTRAP_SCRIPT = `
try {
  var m = document.cookie.match(/(?:^|; )dcw-theme=([^;]+)/);
  document.documentElement.classList.toggle('dark', !m || m[1] !== 'light');
} catch (_) { document.documentElement.classList.add('dark'); }
`;

function isLight(): boolean {
  try {
    const m = document.cookie.match(/(?:^|; )dcw-theme=([^;]+)/);
    return m?.[1] === "light";
  } catch {
    return false;
  }
}

export function ThemeSync() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        id="dcw-theme-boot"
        dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
      />
    );
  });

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", !isLight());
  }, []);
  return null;
}
