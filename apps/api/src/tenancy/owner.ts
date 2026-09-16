import { and, eq, isNull } from "drizzle-orm";

import { membership, organization, personalAccount } from "@repo/db";
import type { Db } from "@repo/db";
import { forbidden, notFound } from "../common/http";
import type { RequestSession } from "../auth/auth-engine";

/**
 * Tenant owner resolution — the Nest twin of the web app's
 * `resolveNotificationOwner` + `requireOrgAccess` (spec 1.3 / 3.5 / 23.1).
 *
 * Same rule: `slug` present → the org at that slug (404 when unknown or when
 * orgs are disabled, 403 for non-members); absent → the caller's personal
 * account (self-healed like in web). Reads need membership only — a member
 * may always see their OWN notifications; the RBAC map governs org data, not
 * a user's bell.
 *
 * `isRole` is inlined rather than imported: the canonical role→permission map
 * moves here with the RBAC module (etap 2). Until then this guard only needs
 * "is this a known role", which is these three strings.
 */

export type NotificationOwner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

export interface ResolvedOwner {
  owner: NotificationOwner;
  userId: string;
}

const ROLES = ["member", "admin", "owner"] as const;

function isRole(value: string): value is (typeof ROLES)[number] {
  return (ROLES as readonly string[]).includes(value);
}

async function getOrgBySlug(db: Db, slug: string) {
  const [row] = await db
    .select()
    .from(organization)
    .where(and(eq(organization.slug, slug), isNull(organization.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function getMembership(db: Db, organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.organizationId, organizationId), eq(membership.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function getPersonalAccountByUserId(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(personalAccount)
    .where(and(eq(personalAccount.userId, userId), isNull(personalAccount.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function resolveNotificationOwner(
  db: Db,
  session: RequestSession,
  slug: string | null,
  orgsEnabled: boolean,
): Promise<ResolvedOwner> {
  if (slug) {
    // 404, not 403, when orgs are disabled (spec 1.4): the feature exists for
    // nobody, so the answer must not admit it is there.
    if (!orgsEnabled) notFound("Organization not found");
    const org = await getOrgBySlug(db, slug);
    if (!org) notFound("Organization not found");
    const member = await getMembership(db, org.id, session.user.id);
    if (!member || member.status !== "active" || !isRole(member.role)) {
      forbidden("Not a member of this organization");
    }
    return { owner: { kind: "organization", organizationId: org.id }, userId: session.user.id };
  }

  let account = await getPersonalAccountByUserId(db, session.user.id);
  if (!account) {
    // Self-heal for accounts seeded before personal accounts existed (§3.1).
    await db.insert(personalAccount).values({ userId: session.user.id }).onConflictDoNothing();
    account = await getPersonalAccountByUserId(db, session.user.id);
  }
  if (!account) {
    // Unreachable in practice (the insert above just created it) — a 500
    // rather than a 404, because "no account" here means the write failed.
    throw new Error(`no personal account for user ${session.user.id}`);
  }
  return { owner: { kind: "personal", accountId: account.id }, userId: session.user.id };
}
