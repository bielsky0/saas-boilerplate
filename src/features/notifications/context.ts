import { requireSession } from "@/lib/auth";
import { requireOrgAccess } from "@/features/organizations/context";
import { servedSubdomain } from "@/features/organizations/served-org";
import { ensurePersonalAccount, getPersonalAccountByUserId } from "@/features/organizations/data";
import type { NotificationOwner } from "./data";

/**
 * Resolve which tenant a notification request acts as (spec 23.1 → 1.3).
 *
 * The same two-context rule as storage (`resolveStorageOwner`): ORG-scoped when
 * the request was addressed to an ACADEMY HOST, PERSONAL-scoped on the apex.
 * The discriminator moved from a query/form field to the host in F4.6 — the bell
 * used to read the slug out of `usePathname()` and send it back, which meant the
 * client chose its own scope. Reads/mark-read need
 * only membership (`requireOrgAccess`, not a specific permission) — a member may
 * always see and clear their OWN notifications; the RBAC map governs org data,
 * not a user's personal bell. Personal notifications need only a valid session.
 */
export type ResolvedNotificationOwner = { owner: NotificationOwner; userId: string };

export async function resolveNotificationOwner(): Promise<ResolvedNotificationOwner> {
  if (await servedSubdomain()) {
    const ctx = await requireOrgAccess();
    return {
      owner: { kind: "organization", organizationId: ctx.org.id },
      userId: ctx.session.user.id,
    };
  }

  const session = await requireSession();
  let account = await getPersonalAccountByUserId(session.user.id);
  if (!account) {
    // Self-heal for accounts seeded before personal accounts existed (§3.1).
    await ensurePersonalAccount(session.user.id);
    account = await getPersonalAccountByUserId(session.user.id);
  }
  if (!account) {
    throw new Error(`no personal account for user ${session.user.id}`);
  }
  return { owner: { kind: "personal", accountId: account.id }, userId: session.user.id };
}
