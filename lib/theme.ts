import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const v = store.get("dcw-theme")?.value;
  return v === "light" ? "light" : "dark";
}
