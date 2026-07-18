import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { invitation, membership, organization, personalAccount, user } from "@/lib/db/schema";

/**
 * Organizations data-access layer (spec 1.3 / 11.2 — tenant-scoped queries).
 *
 * The feature's own Drizzle layer. Every read/write here is scoped by the tenant
 * owner (`organizationId`) or the acting user, so isolation is enforced in the
 * data layer, not the UI. Feature code (actions, pages) calls these helpers and
 * never writes ad-hoc queries. Reference implementation for owner-scoped access.
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

/** The caller's membership in an org, or null. */
export async function getMembership(organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Members of an org with their user identity, newest first. */
export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const rows = await db
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
export async function listPendingInvitations(organizationId: string) {
  return db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, "pending")))
    .orderBy(desc(invitation.createdAt));
}

/** Look up an invitation by the SHA-256 of its raw token. */
export async function getInvitationByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/**
 * Look up an invitation and whether it is currently redeemable (pending and not
 * expired). The time check lives here rather than in a React render so the page
 * stays pure.
 */
export async function getInvitationWithValidity(tokenHash: string) {
  const invite = await getInvitationByTokenHash(tokenHash);
  const valid =
    invite !== null && invite.status === "pending" && invite.expiresAt.getTime() >= Date.now();
  return { invite, valid };
}

/**
 * The orgs a user actively belongs to (for the account switcher). Personal
 * context is derived separately from the user record, not returned here.
 */
export async function listUserOrgs(userId: string): Promise<OrgSummary[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(organization, eq(membership.organizationId, organization.id))
    .where(
      and(
        eq(membership.userId, userId),
        eq(membership.status, "active"),
        isNull(organization.deletedAt),
      ),
    )
    .orderBy(organization.name);
  return rows;
}
