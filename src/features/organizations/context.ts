import { forbidden, notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import type { Session } from "@/lib/adapters/auth";
import { hasPermission, isRole, type Permission, type Role } from "@/features/rbac";
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
 * Require the caller to be an active member of the org at `slug`. Redirects to
 * login when unauthenticated (via `requireSession`), 404s when the org doesn't
 * exist, and 403s (`forbidden`) when the user is not an active member.
 */
export async function requireOrgAccess(slug: string): Promise<OrgContext> {
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
