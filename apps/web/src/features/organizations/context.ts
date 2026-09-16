import { forbidden, notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import type { Session } from "@/lib/adapters/auth";
import { hasPermission, isRole, type Permission, type Role } from "@/features/rbac";
import { orgsEnabled } from "@/lib/tenancy";
import { getMembership, getOrgBySlug } from "./data";

/**
 * Active-org context resolution + authorization (spec 3.5 / 4.2).
 *
 * The single backend chokepoint every org-scoped page and server action calls
 * first. The active tenant is derived from the URL slug (stateless, refresh-safe).
 * Authorization failures use Next's `forbidden()` → a real 403 (requires
 * `experimental.authInterrupts`), so an unauthorized *direct* call is rejected
 * regardless of what the UI showed (spec 4.2). This is the reference RBAC guard.
 */

export type OrgContext = {
  session: Session;
  org: NonNullable<Awaited<ReturnType<typeof getOrgBySlug>>>;
  membership: NonNullable<Awaited<ReturnType<typeof getMembership>>>;
  role: Role;
};

/**
 * Refuse when organizations are switched off (spec 1.4, MULTI_TENANCY_MODE=disabled).
 *
 * 404, NOT `forbidden()`. A 403 says "this exists and you may not have it" — a true
 * statement about RBAC and a false one here: in `disabled` the feature exists for
 * nobody. §1.4 asks for the org UI to be "całkowicie ukryte", and a 403 is a page
 * that admits it is there.
 *
 * Note the asymmetry with `requireOrgAccess` below, which 404s an unknown slug and
 * 403s a non-member: those are per-CALLER answers. This one is global, so it can
 * never leak anything caller-specific.
 */
export function requireOrgsEnabled(): void {
  if (!orgsEnabled) notFound();
}

/**
 * Require the caller to be an active member of the org at `slug`. Refuses outright
 * when orgs are disabled (§1.4), redirects to login when unauthenticated (via
 * `requireSession`), 404s when the org doesn't exist, and 403s (`forbidden`) when
 * the user is not an active member.
 *
 * The `requireOrgsEnabled` call here is what covers every org page under
 * `/orgs/[slug]/*` AND every server action that funnels through
 * `requireOrgPermission` — one line, not one per call site. Only the two actions
 * that legitimately bypass this chokepoint (create / accept-invitation) guard
 * themselves, plus `orgs/layout.tsx` for `/orgs/new`.
 */
export async function requireOrgAccess(slug: string): Promise<OrgContext> {
  requireOrgsEnabled();
  const session = await requireSession(`/orgs/${slug}`);
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const membership = await getMembership(org.id, session.user.id);
  if (!membership || membership.status !== "active") {
    forbidden();
  }
  if (!isRole(membership.role)) {
    forbidden();
  }
  return { session, org, membership, role: membership.role };
}

/**
 * Require a specific permission in the org context. Resolves access first, then
 * checks the centralized role→permission map; 403s if the permission is missing.
 * Every data-changing org action MUST call this before mutating.
 */
export async function requireOrgPermission(
  slug: string,
  permission: Permission,
): Promise<OrgContext> {
  const ctx = await requireOrgAccess(slug);
  if (!hasPermission(ctx.role, permission)) {
    forbidden();
  }
  return ctx;
}
