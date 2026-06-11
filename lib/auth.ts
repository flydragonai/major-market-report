import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Single-secret bearer-token gate. Same idea as the score app's admin
 * key — set ADMIN_TOKEN in env, attach `Authorization: Bearer <token>`
 * on the request or `?t=<token>` in the URL, get in. Cookie persists
 * the token across navigations once set.
 *
 * If ADMIN_TOKEN is unset, the gate is open — useful for local dev.
 * Don't ship to prod without setting it.
 */
const COOKIE = "mmr_admin";

export async function requireAdmin(): Promise<void> {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected) return;

  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get(COOKIE)?.value;
  const hdrs = await headers();
  const bearer = (hdrs.get("authorization") ?? "")
    .replace(/^bearer\s+/i, "")
    .trim();
  const ok = tokenFromCookie === expected || bearer === expected;
  if (ok) return;
  // No JS-driven login screen yet — bounce to a static "unauthorized" page.
  redirect("/unauthorized");
}

/**
 * Server action target — accepts a posted token, sets the cookie, redirects.
 * Wired from app/unauthorized/page.tsx so an operator can paste the token
 * once and stay signed in.
 */
export async function loginWithToken(formData: FormData): Promise<void> {
  "use server";
  const expected = process.env.ADMIN_TOKEN?.trim();
  const provided = String(formData.get("token") ?? "").trim();
  if (!expected) redirect("/");
  if (provided !== expected) redirect("/unauthorized?bad=1");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  redirect("/");
}
