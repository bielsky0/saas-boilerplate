import { requireSession } from "@/lib/auth";
import type { Permission } from "@/features/rbac";
import { requireOrgAccess, requireOrgPermission } from "@/features/organizations/context";
import { servedSubdomain } from "@/features/organizations/served-org";
import { ensurePersonalAccount, getPersonalAccountByUserId } from "@/features/organizations/data";
import type { FileOwner } from "./data";

/**
 * Resolve which tenant a storage request acts as (spec 21.3 → 1.3).
 *
 * A request is ORG-scoped when it was addressed to an ACADEMY HOST,
 * PERSONAL-scoped on the apex (F4.6) — the same two owner contexts, but the
 * discriminator is now the host rather than a field the caller supplies. Org
 * access runs
 * through the shared RBAC guard (`requireOrgPermission`, or `requireOrgAccess`
 * when the action needs membership but no specific permission, e.g. reads), so
 * authorization is enforced identically to every other org action (§4.2), not
 * reinvented here. Personal files need only a valid session — you own your own
 * account.
 */
export type ResolvedOwner = { owner: FileOwner; userId: string };

export async function resolveStorageOwner(
  orgPermission: Permission | null,
): Promise<ResolvedOwner> {
  if (await servedSubdomain()) {
    const ctx = orgPermission
      ? await requireOrgPermission(orgPermission)
      : await requireOrgAccess();
    return {
      owner: { kind: "organization", organizationId: ctx.org.id },
      userId: ctx.session.user.id,
    };
  }

  const session = await requireSession();
  let account = await getPersonalAccountByUserId(session.user.id);
  if (!account) {
    // Self-heal for accounts seeded before personal accounts existed.
    await ensurePersonalAccount(session.user.id);
    account = await getPersonalAccountByUserId(session.user.id);
  }
  if (!account) {
    throw new Error(`no personal account for user ${session.user.id}`);
  }
  return { owner: { kind: "personal", accountId: account.id }, userId: session.user.id };
}
