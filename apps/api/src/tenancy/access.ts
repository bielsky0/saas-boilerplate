import { and, eq, isNull } from "drizzle-orm";

import { hasPermission, isRole, type Permission, type Role } from "@repo/contracts";
import { membership, organization, personalAccount, type Db } from "@repo/db";
import type { RequestSession } from "../auth/auth-engine";
import { forbidden, notFound } from "../common/http";

/**
 * Organization access — the single backend chokepoint (spec 3.5, 4.2).
 *
 * Three flows used to resolve "which org, may they?" three different ways
 * (`requireOrgContext` in `organizations.service.ts`, `resolveNotificationOwner`
 * and `resolveStorageOwner` in `tenancy/owner.ts`), each with its own copy of
 * the org/membership/account lookups. Three copies drift — and an access check
 * that drifts is a tenant-isolation breach wearing a comment. Everything here
 * funnels through `requireOrgMember`; the callers only add their own
 * personal-account fallback on top.
 *
 * Semantics (identical everywhere, by construction now):
 * - 404 for unknown slug or disabled orgs — never 403, which would admit the
 *   feature exists (spec 1.4);
 * - 403 for non-members / inactive memberships / unknown roles, and 403 for a
 *   missing permission (spec 4.2).
 *
 * Plain functions taking `db`, not an `@Injectable` — `tenancy/` is not a Nest
 * module, so there is no DI graph to join and no cycle to create. See
 * ADR-0003 for why this is functions and not an `OrgPermissionGuard` class.
 */

export interface OrgMembership {
  org: typeof organization.$inferSelect;
  membership: typeof membership.$inferSelect;
  role: Role;
}

export async function getOrgBySlug(db: Db, slug: string) {
  const [row] = await db
    .select()
    .from(organization)
    .where(and(eq(organization.slug, slug), isNull(organization.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getMembership(db: Db, organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getPersonalAccountByUserId(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(personalAccount)
    .where(and(eq(personalAccount.userId, userId), isNull(personalAccount.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Personal account, self-healed for accounts seeded before personal accounts
 * existed (§3.1). The trailing throw is unreachable in practice (the insert
 * just created it) — a 500 rather than a 404, because "no account" here means
 * the write failed.
 */
export async function getOrCreatePersonalAccount(db: Db, userId: string) {
  let account = await getPersonalAccountByUserId(db, userId);
  if (!account) {
    await db.insert(personalAccount).values({ userId }).onConflictDoNothing();
    account = await getPersonalAccountByUserId(db, userId);
  }
  if (!account) {
    throw new Error(`no personal account for user ${userId}`);
  }
  return account;
}

/**
 * Resolve the active org from the slug and enforce membership + permission.
 * Pass `null` as `permission` for reads — membership alone is enough there
 * (same rule as web's `requireOrgAccess` branch).
 */
export async function requireOrgMember(
  db: Db,
  session: RequestSession,
  slug: string,
  orgsEnabled: boolean,
  permission?: Permission,
): Promise<OrgMembership> {
  if (!orgsEnabled) notFound("Organization not found");
  const org = await getOrgBySlug(db, slug);
  if (!org) notFound("Organization not found");
  const member = await getMembership(db, org.id, session.user.id);
  if (!member || member.status !== "active" || !isRole(member.role)) {
    forbidden("Not a member of this organization");
  }
  if (permission && !hasPermission(member.role, permission)) {
    forbidden("Forbidden");
  }
  return { org, membership: member, role: member.role };
}
