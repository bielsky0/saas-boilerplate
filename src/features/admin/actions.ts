"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminAuthAdapter, authAdapter } from "@/lib/adapters/auth";
import { db } from "@/lib/db";
import { membership, organization, personalAccount, user } from "@/lib/db/schema";
import type { FormState } from "@/lib/validation";
import { recordAudit } from "./audit";
import { requireSuperAdmin } from "./context";
import { countSuperAdmins, getUserDetail, getUserEmailById, listSolelyOwnedOrgs } from "./data";
import {
  impersonateUserSchema,
  orgTargetSchema,
  setSuperAdminSchema,
  suspendUserSchema,
  userTargetSchema,
} from "./schema";

/**
 * Super-admin server actions (spec 6.2) — the ONLY caller of `adminAuthAdapter`.
 *
 * That exclusivity is the audit guarantee (spec 6.3), and it rests on three
 * layers, none of which is a type-system proof:
 *   1. the engine's own /api/auth/admin/* HTTP surface is 404'd in the catch-all
 *      route, so there is no unaudited path in from outside;
 *   2. `no-restricted-imports` (eslint.config.mjs) fails CI if anything outside
 *      features/admin imports the adapter;
 *   3. every action below calls `requireSuperAdmin()` as its FIRST line, then
 *      writes the audit row per the two rules in `./audit.ts`.
 *
 * Read `./audit.ts`'s header before touching the ordering in any of these.
 */

/** The shared shape from `@/lib/validation` (spec 22.2) — see the note in
 * `features/organizations/actions.ts` on why the alias keeps this name. */
export type ActionState = FormState;

const GENERIC_ERROR = "Something went wrong. Please try again.";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Super admins are immune to panel actions until demoted.
 *
 * One consistent story rather than a per-action judgement call: it prevents
 * admin-vs-admin lockout races, and "demote, then act" is one extra click on an
 * action that should never be casual. The engine enforces the same for
 * impersonation; this covers suspend/delete, which it does not.
 */
const ADMIN_IMMUNE = "This user is a super admin. Revoke super-admin access first.";

/**
 * Impersonate a user (spec 6.2). Audit-first — Rule B in ./audit.ts.
 *
 * The ordering is not stylistic here: `impersonate()` swaps the session cookie and
 * this action then redirects (which throws), so auditing afterwards would leave a
 * window where the cookie is already swapped and no row exists.
 */
export async function impersonateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

  const parsed = impersonateUserSchema.safeParse({
    userId: str(formData.get("userId")),
    reason: str(formData.get("reason")),
  });
  // Surfaces the actual message, unlike the other actions' GENERIC_ERROR. Those
  // can only fail on a malformed hidden field, which a human cannot fix and should
  // not see; this one fails on a field the admin just typed, so telling them why
  // is the difference between a working form and a dead button.
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  const target = await getUserDetail(parsed.data.userId);
  if (!target) return { error: "User not found." };
  if (target.status === "deleted") return { error: "This account has been deleted." };

  await recordAudit(db, {
    action: "impersonation.start",
    actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
    organizationId: null,
    targetType: "user",
    targetId: target.id,
    targetLabel: target.email,
    metadata: { reason: parsed.data.reason },
  });

  const result = await adminAuthAdapter.impersonate(target.id, await headers());
  if (!result.ok) {
    if (result.code === "IMPERSONATION_FORBIDDEN") {
      return { error: "You cannot impersonate this user." };
    }
    if (result.code === "USER_NOT_FOUND") return { error: "User not found." };
    return { error: GENERIC_ERROR };
  }

  redirect("/dashboard");
}

/**
 * Leave admin mode (spec 6.2).
 *
 * Deliberately NOT guarded by `requireSuperAdmin()`: the caller is, by definition,
 * currently the impersonated (non-admin) user, so the guard would 403 exactly the
 * person who needs to get out. The session's own `impersonatedBy` is the
 * authorization — you can only stop what you are already inside.
 */
export async function stopImpersonatingAction(): Promise<void> {
  const requestHeaders = await headers();
  const session = await authAdapter.getSession(requestHeaders);
  if (!session?.impersonatedBy) redirect("/dashboard");

  /*
   * Everything the audit entry needs is resolved BEFORE the swap, and the entry is
   * written before it too (Rule B in ./audit.ts). Both halves matter:
   *
   *  - ATTRIBUTION: the actor is the admin who started this, and the only record of
   *    who that is lives on the session we are about to destroy.
   *  - CORRECTNESS: `headers()` returns the REQUEST headers, which keep the old
   *    cookie for this whole request — a Set-Cookie only lands on the RESPONSE. So
   *    calling getSession() again AFTER stopImpersonating re-reads a session the
   *    engine has just deleted, and the engine answers by clearing the session
   *    cookie — clobbering the admin session that was just restored and silently
   *    logging the admin out. Do not reintroduce a read after the swap.
   */
  const impersonatedUser = session.user;
  const adminEmail = await getUserEmailById(session.impersonatedBy);

  await recordAudit(db, {
    action: "impersonation.stop",
    actor: {
      actorType: "Admin",
      actorId: session.impersonatedBy,
      actorEmail: adminEmail ?? "(unknown admin)",
    },
    organizationId: null,
    targetType: "user",
    targetId: impersonatedUser.id,
    targetLabel: impersonatedUser.email,
  });

  const result = await adminAuthAdapter.stopImpersonating(requestHeaders);

  if (!result.ok) {
    // The engine 500s here when the ADMIN'S OWN session expired during the
    // impersonation — it has no session left to restore. Without this fallback the
    // admin stays trapped inside someone else's account until the impersonated
    // session expires, which is the worst possible time to have no escape.
    // Signing out is always safe and always available.
    await authAdapter.signOut(requestHeaders);
    redirect("/login");
  }

  redirect("/dashboard");
}

/** Suspend an account (spec 6.2). Audit-first — Rule B. */
export async function suspendUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

  const parsed = suspendUserSchema.safeParse({
    userId: str(formData.get("userId")),
    reason: str(formData.get("reason")) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };

  if (parsed.data.userId === ctx.actorId) {
    return { error: "You cannot suspend your own account." };
  }

  const target = await getUserDetail(parsed.data.userId);
  if (!target) return { error: "User not found." };
  if (target.isSuperAdmin) return { error: ADMIN_IMMUNE };
  if (target.status === "deleted") return { error: "This account has been deleted." };

  await recordAudit(db, {
    action: "user.suspend",
    actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
    organizationId: null,
    targetType: "user",
    targetId: target.id,
    targetLabel: target.email,
    metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
  });

  const result = await adminAuthAdapter.suspendUser(
    target.id,
    parsed.data.reason ?? null,
    await headers(),
  );
  if (!result.ok) return { error: GENERIC_ERROR };

  revalidatePath(`/admin/users/${target.id}`);
  revalidatePath("/admin/users");
  return { success: `${target.email} has been suspended.` };
}

/** Lift a suspension (spec 6.2). Audit-first — Rule B. */
export async function unsuspendUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

  const parsed = userTargetSchema.safeParse({ userId: str(formData.get("userId")) });
  if (!parsed.success) return { error: GENERIC_ERROR };

  const target = await getUserDetail(parsed.data.userId);
  if (!target) return { error: "User not found." };
  // Deleted is terminal: un-suspending must never look like a way to resurrect an
  // account. This is why `banned` and `deletedAt` are kept as separate facts.
  if (target.status === "deleted") {
    return { error: "This account has been deleted and cannot be reactivated." };
  }

  await recordAudit(db, {
    action: "user.unsuspend",
    actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
    organizationId: null,
    targetType: "user",
    targetId: target.id,
    targetLabel: target.email,
  });

  const result = await adminAuthAdapter.unsuspendUser(target.id, await headers());
  if (!result.ok) return { error: GENERIC_ERROR };

  revalidatePath(`/admin/users/${target.id}`);
  revalidatePath("/admin/users");
  return { success: `${target.email} has been reactivated.` };
}

/**
 * Soft-delete an account (spec 6.2 + 11.3). Our own effect — Rule A: the audit
 * row commits in the SAME transaction as the deletion.
 *
 * Cascades the user's solely-owned organizations. Refusing instead would make a
 * user undeletable because they once created an org (breaking GDPR erasure);
 * leaving those orgs behind would strand them with no owner, violating the §3.2
 * invariant the rest of the codebase enforces. Orgs that have other owners are
 * untouched. The confirm dialog names every cascaded org — never silently.
 */
export async function deleteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

  const parsed = userTargetSchema.safeParse({ userId: str(formData.get("userId")) });
  if (!parsed.success) return { error: GENERIC_ERROR };

  if (parsed.data.userId === ctx.actorId) {
    return { error: "You cannot delete your own account." };
  }

  const target = await getUserDetail(parsed.data.userId);
  if (!target) return { error: "User not found." };
  if (target.isSuperAdmin) return { error: ADMIN_IMMUNE };
  if (target.status === "deleted") return { error: "This account is already deleted." };

  const cascaded = await listSolelyOwnedOrgs(target.id);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(user).set({ deletedAt: now }).where(eq(user.id, target.id));
    await tx
      .update(personalAccount)
      .set({ deletedAt: now })
      .where(eq(personalAccount.userId, target.id));

    for (const org of cascaded) {
      await tx.update(organization).set({ deletedAt: now }).where(eq(organization.id, org.id));
      await recordAudit(tx, {
        action: "organization.delete",
        actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
        organizationId: org.id,
        targetType: "organization",
        targetId: org.id,
        targetLabel: org.slug,
        metadata: { cascadedFrom: target.id, cascadedFromEmail: target.email },
      });
    }

    await tx.delete(membership).where(eq(membership.userId, target.id));

    await recordAudit(tx, {
      action: "user.delete",
      actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "user",
      targetId: target.id,
      targetLabel: target.email,
      metadata: cascaded.length > 0 ? { cascadedOrgs: cascaded.map((o) => o.slug) } : undefined,
    });
  });

  // Hygiene only, deliberately AFTER the commit and deliberately unchecked:
  // `getSession` already returns null for a deleted user, so their live sessions
  // die on their next request whether or not this succeeds. Correctness does not
  // depend on it, which is exactly why it can live outside the transaction.
  await adminAuthAdapter.revokeUserSessions(target.id, await headers());

  revalidatePath(`/admin/users/${target.id}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  return { success: `${target.email} has been deleted.` };
}

/** Soft-delete an organization (spec 6.2 + 11.3). Our own effect — Rule A. */
export async function deleteOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

  const parsed = orgTargetSchema.safeParse({
    organizationId: str(formData.get("organizationId")),
  });
  if (!parsed.success) return { error: GENERIC_ERROR };

  const [org] = await db
    .select({ id: organization.id, slug: organization.slug, deletedAt: organization.deletedAt })
    .from(organization)
    .where(eq(organization.id, parsed.data.organizationId))
    .limit(1);

  if (!org) return { error: "Organization not found." };
  if (org.deletedAt) return { error: "This organization is already deleted." };

  await db.transaction(async (tx) => {
    await tx.update(organization).set({ deletedAt: new Date() }).where(eq(organization.id, org.id));
    await recordAudit(tx, {
      action: "organization.delete",
      actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: org.id,
      targetType: "organization",
      targetId: org.id,
      targetLabel: org.slug,
    });
  });

  revalidatePath(`/admin/organizations/${org.id}`);
  revalidatePath("/admin/organizations");
  return { success: `${org.slug} has been deleted.` };
}

/**
 * Grant or revoke the system-level super-admin flag (spec 6.1). Audit-first — Rule B.
 *
 * Not in §6.2's literal list of panel functions, but §6.1 mandates the flag, and a
 * flag whose only management surface is raw SQL is an incomplete feature. It is
 * also the highest-privilege action in the system, which makes it the strongest
 * case for the audit log — and it is what makes §6.3's "role change" real, since
 * §6.1 defines super admin as a SYSTEM role.
 */
export async function setSuperAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSuperAdmin();

  const parsed = setSuperAdminSchema.safeParse({
    userId: str(formData.get("userId")),
    value: str(formData.get("value")),
  });
  if (!parsed.success) return { error: GENERIC_ERROR };

  const grant = parsed.data.value === "grant";

  if (!grant && parsed.data.userId === ctx.actorId) {
    return { error: "You cannot revoke your own super-admin access." };
  }

  const target = await getUserDetail(parsed.data.userId);
  if (!target) return { error: "User not found." };
  if (target.status === "deleted") return { error: "This account has been deleted." };
  if (grant && target.isSuperAdmin) return { error: "This user is already a super admin." };
  if (!grant && !target.isSuperAdmin) return { error: "This user is not a super admin." };

  if (!grant) {
    // Pre-read, not a FOR UPDATE lock. A lock held across the engine call is the
    // pattern ./audit.ts's Rule B rejects (two connections, one small pool), and
    // the race it would close — two admins revoking the last two super admins in
    // the same instant — is a once-a-year human action with a SQL-level recovery.
    // This is the one place NOT to copy `lockActiveOwnerCount` from §3.
    if ((await countSuperAdmins()) <= 1) {
      return { error: "You cannot revoke the last super admin." };
    }
  }

  await recordAudit(db, {
    action: grant ? "superadmin.grant" : "superadmin.revoke",
    actor: { actorType: "Admin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
    organizationId: null,
    targetType: "user",
    targetId: target.id,
    targetLabel: target.email,
  });

  const result = await adminAuthAdapter.setSuperAdmin(target.id, grant, await headers());
  if (!result.ok) return { error: GENERIC_ERROR };

  revalidatePath(`/admin/users/${target.id}`);
  revalidatePath("/admin/users");
  return {
    success: grant
      ? `${target.email} is now a super admin.`
      : `${target.email} is no longer a super admin.`,
  };
}
