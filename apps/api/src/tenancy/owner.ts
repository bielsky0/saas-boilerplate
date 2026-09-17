import type { Permission } from "@repo/contracts";
import type { Db } from "@repo/db";
import type { RequestSession } from "../auth/auth-engine";
import { getOrCreatePersonalAccount, requireOrgMember } from "./access";

/**
 * Tenant owner resolution — the Nest twin of the web app's
 * `resolveNotificationOwner` + `requireOrgAccess` (spec 1.3 / 3.5 / 23.1).
 *
 * Thin wrappers over `tenancy/access`: the org branch is `requireOrgMember`
 * (same 404/403 semantics as every other org-scoped flow, by construction),
 * the personal branch is `getOrCreatePersonalAccount`. No query lives here —
 * this file only decides which owner shape a request acts as.
 */

export type NotificationOwner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

export interface ResolvedOwner {
  owner: NotificationOwner;
  userId: string;
}

export async function resolveNotificationOwner(
  db: Db,
  session: RequestSession,
  slug: string | null,
  orgsEnabled: boolean,
): Promise<ResolvedOwner> {
  if (slug) {
    // Reads need membership only — a member may always see their OWN
    // notifications; the RBAC map governs org data, not a user's bell.
    const { org } = await requireOrgMember(db, session, slug, orgsEnabled);
    return { owner: { kind: "organization", organizationId: org.id }, userId: session.user.id };
  }

  const account = await getOrCreatePersonalAccount(db, session.user.id);
  return { owner: { kind: "personal", accountId: account.id }, userId: session.user.id };
}

/**
 * Resolve which tenant a storage request acts as (spec 21.3 → 1.3) — the
 * Nest twin of web's `features/storage/context.ts`, ported in faza 2.4.
 *
 * A request is ORG-scoped when it carries a `slug`, PERSONAL-scoped
 * otherwise. Pass `null` as `permission` for reads (membership is enough,
 * e.g. the file list and single reads — same as web's `requireOrgAccess`
 * branch). Personal files need only a valid session.
 */
export async function resolveStorageOwner(
  db: Db,
  session: RequestSession,
  slug: string | null,
  permission: Permission | null,
  orgsEnabled: boolean,
): Promise<ResolvedOwner> {
  if (slug) {
    const { org } = await requireOrgMember(db, session, slug, orgsEnabled, permission ?? undefined);
    return {
      owner: { kind: "organization", organizationId: org.id },
      userId: session.user.id,
    };
  }

  const account = await getOrCreatePersonalAccount(db, session.user.id);
  return { owner: { kind: "personal", accountId: account.id }, userId: session.user.id };
}
