import { forbidden, notFound } from "next/navigation";

import { ApiError } from "@repo/api-client";
import { requireSession } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Session } from "@/lib/adapters/auth";
import { hasPermission, isRole, type Permission, type Role } from "@/features/rbac";
import { orgsEnabled } from "@/lib/tenancy";

/**
 * Active-org context resolution + authorization (spec 3.5 / 4.2, faza 2.8).
 *
 * The single backend chokepoint every org-scoped page calls first. The active
 * tenant is derived from the URL slug (stateless, refresh-safe). Membership
 * and role now resolve over HTTP (`GET /v1/organizations/{slug}` answers
 * `{id, name, slug, role}` or 404/403) — the web holds no database since
 * faza 2.8. Authorization failures use Next's `forbidden()` → a real 403
 * (requires `experimental.authInterrupts`), so an unauthorized *direct* call
 * is rejected regardless of what the UI showed (spec 4.2).
 */

export type OrgContext = {
  session: Session;
  org: { id: string; name: string; slug: string };
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
 * `/orgs/[slug]/*`. Only the two flows that legitimately bypass this chokepoint
 * (create / accept-invitation) guard themselves, plus `orgs/layout.tsx` for
 * `/orgs/new`.
 */
export async function requireOrgAccess(slug: string): Promise<OrgContext> {
  requireOrgsEnabled();
  const session = await requireSession(`/orgs/${slug}`);
  let org: { id: string; name: string; slug: string; role: string };
  try {
    org = await api().get<{ id: string; name: string; slug: string; role: string }>(
      `/v1/organizations/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    // Nest speaks HTTP statuses; Next speaks interrupts. 404 = unknown slug
    // (or disabled orgs — indistinguishable by design), 403 = non-member.
    // 401 cannot happen after `requireSession` passed, but if it does the
    // honest answer is "log in again", never a 403 that admits the org exists.
    if (error instanceof ApiError) {
      if (error.status === 404) notFound();
      if (error.status === 403) forbidden();
      if (error.status === 401) await requireSession(`/orgs/${slug}`);
    }
    throw error;
  }
  // The role travels as a plain string over the wire; an unknown value is a
  // contract breach, and the fail-closed answer is 403, not a crash.
  if (!isRole(org.role)) {
    forbidden();
  }
  return { session, org: { id: org.id, name: org.name, slug: org.slug }, role: org.role };
}

/**
 * Require a specific permission in the org context. Resolves access first, then
 * checks the centralized role→permission map; 403s if the permission is missing.
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
