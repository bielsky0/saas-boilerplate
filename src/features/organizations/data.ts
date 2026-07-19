import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import type { TenantDb } from "@/lib/db/tenant";
import { invitation, membership, organization, personalAccount, user } from "@/lib/db/schema";

/**
 * Organizations data-access layer (spec 1.3 / 11.2 — tenant-scoped queries).
 *
 * The feature's own Drizzle layer. Every read/write here is scoped by the tenant
 * owner (`organizationId`) or the acting user, so isolation is enforced in the
 * data layer, not the UI. Feature code (actions, pages) calls these helpers and
 * never writes ad-hoc queries. Reference implementation for owner-scoped access.
 *
 * TWO KINDS OF FUNCTION LIVE HERE SINCE F1a, and the difference is visible in
 * the signature:
 *
 * - Functions touching a table under RLS (`membership`, `invitation`) take a
 *   `TenantDb` as their first parameter. Calling one without opening
 *   `withTenant` is then a compile error rather than a silently empty result.
 * - Functions touching tables outside RLS (`organization`, `personal_account`,
 *   `user`) keep using `db` directly. Both owner TARGETS are outside RLS by
 *   construction — a policy keyed on the owner cannot apply to the row that
 *   defines it; see the header of `src/lib/db/schema/index.ts`.
 *
 * Reads that cannot name a tenant at all live in `./cross-tenant.ts`.
 */

export type MemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: Date;
};

export type OrgSummary = { id: string; name: string; slug: string; role: string };

/** Idempotently ensure a user's personal account exists (spec 3.1). */
export async function ensurePersonalAccount(userId: string): Promise<void> {
  await db.insert(personalAccount).values({ userId }).onConflictDoNothing();
}

/**
 * A user's non-deleted personal account, or null — the personal counterpart to
 * `getOrgBySlug`. Needed wherever the personal tenant must be named by its own
 * id rather than derived from the session's user id (e.g. a billing record
 * owned by a personal account — spec 5.2).
 */
export async function getPersonalAccountByUserId(userId: string) {
  const [row] = await db
    .select()
    .from(personalAccount)
    .where(and(eq(personalAccount.userId, userId), isNull(personalAccount.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * A non-deleted user by email, or null — used to decide whether an invitee
 * already has an account (spec 3.3), e.g. to raise an in-app invitation
 * notification. Does NOT reveal existence to the caller's user (§3.3 privacy);
 * only server-internal flows consume it.
 */
export async function getUserByEmail(email: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.email, email), isNull(user.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Load a non-deleted org by its URL slug, or null. */
export async function getOrgBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(organization)
    .where(and(eq(organization.slug, slug), isNull(organization.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Load a non-deleted org by id, or null. */
export async function getOrgById(id: string) {
  const [row] = await db
    .select()
    .from(organization)
    .where(and(eq(organization.id, id), isNull(organization.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Whether a slug is already in use — checks ALL orgs including soft-deleted ones,
 * because the unique constraint spans them (a deleted org still owns its slug).
 */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);
  return Boolean(row);
}

/**
 * Whether a subdomain is already in use (langlion §1.2, decyzja D10).
 *
 * Same shape as `isSlugTaken` and for the same reason: soft-deleted orgs are
 * included, because the UNIQUE constraint spans them. Freeing a deleted academy's
 * subdomain would be worse than holding it anyway — the DNS name may still be
 * cached, linked, or printed on something, so handing it to a different academy
 * would silently route one academy's parents to another's registration form.
 */
export async function isSubdomainTaken(subdomain: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.subdomain, subdomain))
    .limit(1);
  return Boolean(row);
}

/**
 * The caller's membership in an org, or null.
 *
 * Takes a `TenantDb`: `membership` is under RLS, so this must run inside
 * `withTenant(organizationId, …)`. The explicit predicate below stays — it is
 * what hits the index, and the policy is the second line (US-1.1/AC1).
 */
export async function getMembership(tx: TenantDb, organizationId: string, userId: string) {
  const [row] = await tx
    .select()
    .from(membership)
    .where(and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Members of an org with their user identity, newest first. */
export async function listMembers(tx: TenantDb, organizationId: string): Promise<MemberRow[]> {
  const rows = await tx
    .select({
      membershipId: membership.id,
      userId: membership.userId,
      email: user.email,
      name: user.name,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
    })
    .from(membership)
    .innerJoin(user, eq(membership.userId, user.id))
    .where(eq(membership.organizationId, organizationId))
    .orderBy(desc(membership.createdAt));
  return rows;
}

/** Pending invitations for an org, newest first. */
export async function listPendingInvitations(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, "pending")))
    .orderBy(desc(invitation.createdAt));
}

/*
 * `getInvitationByTokenHash`, `getInvitationWithValidity` and `listUserOrgs` used
 * to live here. They moved to `./cross-tenant.ts` in F1a: none of them can name a
 * tenant before running, so each needs the documented RLS bypass, and keeping
 * them here would have meant exempting this whole module from the fence — which
 * would hand the escape hatch to `getMembership` and `listMembers`, the two
 * functions the fence exists to constrain. Import them from `./cross-tenant`.
 */
