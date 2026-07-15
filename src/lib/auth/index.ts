import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authAdapter, type Session } from "@/lib/adapters/auth";

/**
 * Server-side auth & authorization helpers (spec 2.5, 4.2).
 *
 * The single entry point for "who is the current user" on the server. It talks
 * to the auth adapter (never the SDK) and is the reference pattern for building
 * a protected route/server action — authorization lives HERE, not in UI
 * components. RBAC/tenant checks are layered on in §3/§4.
 */

/** Resolve and fully validate the current session, or null. */
export async function getServerSession(): Promise<Session | null> {
  return authAdapter.getSession(await headers());
}

/**
 * Require an authenticated session; redirect to /login otherwise. Use in
 * protected server components and server actions. Middleware does an optimistic
 * cookie check for UX, but this is the authoritative guard (spec 4.2).
 */
export async function requireSession(callbackUrl?: string): Promise<Session> {
  const session = await getServerSession();
  if (!session) {
    const target = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login";
    redirect(target);
  }
  return session;
}

/** Sign out the current session (server action helper). */
export async function signOut(): Promise<void> {
  await authAdapter.signOut(await headers());
}
