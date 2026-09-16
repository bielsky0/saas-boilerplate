import { forbidden } from "next/navigation";

import type { Session } from "@/lib/adapters/auth";
import { requireSession } from "@/lib/auth";

/**
 * Super-admin authorization (spec 6.1) — the panel's single backend chokepoint.
 *
 * Mirrors `src/features/organizations/context.ts` (the org-scoped RBAC guard),
 * deliberately: same shape, same `forbidden()` → real 403, so there is one way to
 * guard a route in this codebase, not two.
 *
 * WHY THIS IS NOT IN `src/proxy.ts`, despite spec 6.1's "dodatkowy middleware":
 *
 *  1. The proxy has no database and cannot get one. It is edge-safe by design
 *     (its own header: "no DB or crypto… NOT the security boundary"), and Next's
 *     docs say proxy "should not be used as a full session management or
 *     authorization solution".
 *  2. The only edge-available alternative — a claim cached in the cookie — would
 *     be actively WRONG under this very feature: impersonation swaps the session
 *     cookie, so a cached isSuperAdmin claim is stale exactly when it matters
 *     most. Same for a revoked flag. Authorization must read live state.
 *  3. §4.2 already settled this here: RBAC is enforced by requireOrgPermission +
 *     forbidden(), asserted by e2e/rbac-enforcement.spec.ts. Enforcing §6
 *     differently would contradict a documented, tested pattern for no gain.
 *  4. A layout would not be sufficient anyway — layouts do not guard Server
 *     Actions. An action posted to a route under (admin) runs without the layout
 *     ever rendering.
 *
 * What the spec's intent still gets: a dedicated path (/admin); the standard
 * authentication layer in the proxy, which already redirects an anonymous /admin
 * to /login by default-deny; and this additional, independent super-admin check
 * layered on top — called as the FIRST line of every admin page AND every admin
 * action, never just the layout.
 */

export type AdminContext = {
  session: Session;
  /** The acting super admin — the `actor` of every audit entry (spec 6.3). */
  actorId: string;
  actorEmail: string;
};

export async function requireSuperAdmin(callbackUrl = "/admin"): Promise<AdminContext> {
  const session = await requireSession(callbackUrl);

  // An impersonated session NEVER carries admin authority, whoever it belongs to.
  // Checked BEFORE the flag so this fails closed even if the engine's own role
  // gate is misconfigured (see the adminUserIds warning in the auth adapter).
  // Without this, an admin-mode session could re-enter the panel and act as the
  // impersonated user, and the audit trail would name the wrong actor.
  if (session.impersonatedBy !== null) {
    forbidden();
  }
  if (!session.user.isSuperAdmin) {
    forbidden();
  }

  return { session, actorId: session.user.id, actorEmail: session.user.email };
}
