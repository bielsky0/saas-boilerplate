import { redirect } from "next/navigation";

import { api } from "@/lib/api";
import type { Session } from "@/lib/adapters/auth";

/**
 * Server-side auth & authorization helpers (spec 2.5, 4.2 — faza 2.1).
 *
 * The single entry point for "who is the current user" on the server. The
 * session lives in Nest now: this module resolves it over HTTP (forwarding
 * the browser's cookie — without that forward every call is anonymous) and
 * never touches the database. The reference pattern for a protected
 * route/server action is unchanged — authorization still lives HERE.
 */

interface SessionJSON {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
    isSuperAdmin: boolean;
    suspended: boolean;
    locale: string | null;
  };
  expiresAt: string;
  impersonatedBy: string | null;
}

/** Resolve and fully validate the current session, or null. */
export async function getServerSession(): Promise<Session | null> {
  let json: SessionJSON;
  try {
    json = await api().get<SessionJSON>("/v1/session");
  } catch (error) {
    // No session (Nest answers 401) — or Nest unreachable, which resolves
    // the same way: anonymous. A down API degrades to logged-out, never to
    // an exception on a public page.
    void error;
    return null;
  }
  return {
    user: json.user,
    expiresAt: new Date(json.expiresAt),
    impersonatedBy: json.impersonatedBy,
  };
}

/**
 * Require an authenticated session; redirect to /login otherwise. Use in
 * protected server components and server actions. The proxy's cookie check is
 * optimistic UX only — this is the authoritative guard (spec 4.2).
 */
export async function requireSession(callbackUrl?: string): Promise<Session> {
  const session = await getServerSession();
  if (!session) {
    const target = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login";
    redirect(target);
  }
  return session;
}

/**
 * Sign out the current session.
 *
 * Server-side fallback only (the admin panel's impersonation-exit path): the
 * expired cookie is set on the API response, which the browser never sees —
 * so this kills the session row but cannot clear the browser cookie. The
 * session resolves to null on its next use either way. Interactive sign-out
 * goes browser → Nest directly (see `SignOutButton`).
 */
export async function signOut(): Promise<void> {
  try {
    await api().post("/v1/auth/sign-out");
  } catch {
    // Idempotent: signing out with no session is still success.
  }
}
