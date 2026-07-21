"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createHash, randomUUID } from "node:crypto";

import { changed, recordAudit, resolveActor, withImpersonation } from "@/features/admin/audit";
import { enqueueEmail } from "@/features/emails/send";
import { enqueueNotification } from "@/features/notifications/send";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation, membership, organization, user } from "@/lib/db/schema";
import { clientEnv } from "@/lib/env/client";
import { storedLocaleForEmail, toLocale } from "@/lib/i18n/user-locale";
import type { FormState } from "@/lib/validation";
import { withTenant } from "@/lib/db/tenant";
import { apexUrl } from "@/lib/tenant-url";
import { getInvitationByTokenHash, hashHandoffToken } from "./cross-tenant";
import { requireOrgPermission, requireOrgsEnabled } from "./context";
import {
  ensurePersonalAccount,
  getOrgById,
  getPersonalAccountByUserId,
  getUserByEmail,
  insertHandoff,
  isSlugTaken,
  isSubdomainTaken,
} from "./data";
import { createOrgSchema, inviteMemberSchema, slugSchema, updateRoleSchema } from "./schema";
import { resolveUniqueSlug } from "./slug";

/**
 * Organization server actions (spec 3.2–3.4). Every mutation resolves the active
 * org from the posted `slug` and passes through `requireOrgPermission` before
 * touching data (spec 4.2). Business invariants that must hold under concurrency
 * — chiefly "an org always keeps ≥1 Owner" (§3.2/§3.4) — are enforced inside a
 * transaction that locks the owner rows (`FOR UPDATE`).
 *
 * AUDIT (spec 6.4): every mutation here writes an audit row via `recordAudit`
 * under Rule A — INSIDE the same transaction as the change, so a rollback takes
 * the log entry with it and a committed change can never lack its row. Two
 * conventions that are easy to get wrong:
 *
 *  - `resolveActor(ctx.session)` is awaited BEFORE `db.transaction` opens. It may
 *    query (when the session is impersonated), and a query inside the transaction
 *    would take a SECOND pooled connection while `tx` holds the first — the
 *    deadlock features/admin/audit.ts documents, and the same reason
 *    `inviteeLocale` is resolved outside the transaction below.
 *  - `targetLabel` lookups that DO belong inside use `tx`, not `db`, for that same
 *    reason. Those read rows the transaction is mutating, so they cannot move out.
 */

/**
 * The shared shape from `@/lib/validation` (spec 22.2), kept under this name
 * because the org components import `ActionState` from the action they call and
 * renaming them all would buy nothing. An alias, not a copy: a field added to
 * `FormState` arrives here, which is the point — this type used to be written
 * out identically in four feature files.
 */
export type ActionState = FormState;

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (spec 3.3)

/**
 * Plan Faza 5.5 / decyzja D74. A bridge between two requests of the SAME
 * browser session (apex directory click → tenant host), not a "remember me"
 * mechanism — minutes, not days.
 */
const HANDOFF_TTL_MS = 3 * 60 * 1000;

/** Thrown inside a transaction to abort it and surface a form error instead of a 403. */
class LastOwnerError extends Error {}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/** Count active owners, locking those rows so concurrent demotions serialize. */
async function lockActiveOwnerCount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: membership.id })
    .from(membership)
    .where(
      and(
        eq(membership.organizationId, organizationId),
        eq(membership.role, "owner"),
        eq(membership.status, "active"),
      ),
    )
    .for("update");
  return rows.length;
}

// --- Create -----------------------------------------------------------------

export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // One of the two actions that legitimately bypass `requireOrgAccess` (there is
  // no org yet), so it carries the §1.4 guard itself. Above `requireSession`: a
  // deployment without organizations should not even resolve a session for them.
  requireOrgsEnabled();
  const session = await requireSession("/orgs/new");
  const [t, tv] = await Promise.all([
    getTranslations("organizations.errors"),
    getTranslations("organizations.validation"),
  ]);
  const parsed = createOrgSchema(tv).safeParse({
    name: str(formData.get("name")),
    slug: str(formData.get("slug")) || undefined,
    subdomain: str(formData.get("subdomain")),
    timezone: str(formData.get("timezone")),
    currency: str(formData.get("currency")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("generic") };
  }

  const slug = await resolveUniqueSlug(parsed.data.slug ?? parsed.data.name, isSlugTaken);

  // The subdomain is NOT auto-resolved to a free variant the way the slug is.
  // A slug is internal routing, so silently landing on `acme-2` is harmless; a
  // subdomain is the address an academy will print and hand to parents, so it
  // has to be the one they chose or an error they can see. Losing the race
  // against a concurrent creation still surfaces as the UNIQUE constraint —
  // this check exists to make the ordinary case a field error, not a 500.
  if (await isSubdomainTaken(parsed.data.subdomain)) {
    return { error: tv("subdomainTaken") };
  }

  const actor = await resolveActor(session);

  // The id is minted HERE rather than read back from `.returning()`, because the
  // tenant GUC has to be set when the transaction OPENS and the membership insert
  // inside it is subject to `membership`'s WITH CHECK. Reading the id back would
  // put it in scope one statement too late. The column's `$defaultFn` generates a
  // `randomUUID` anyway, so this changes where the value comes from, not what it
  // is — and it removes a round-trip.
  const organizationId = randomUUID();
  const handoffRawToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");

  await withTenant(organizationId, async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: parsed.data.name,
      slug,
      subdomain: parsed.data.subdomain,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      createdByUserId: session.user.id,
    });
    await tx.insert(membership).values({
      organizationId,
      userId: session.user.id,
      role: "owner",
      status: "active",
    });
    // The genesis row: without it an org's trail begins mid-story, and "who
    // created this tenant" is the first question any audit asks.
    await recordAudit(tx, {
      action: "organization.create",
      actor,
      organizationId,
      targetType: "organization",
      targetId: organizationId,
      targetLabel: slug,
      metadata: withImpersonation(session, { name: parsed.data.name }),
    });
    // Plan Faza 5.5 / decyzja D74 — see the redirect comment below.
    await insertHandoff(tx, {
      organizationId,
      userId: session.user.id,
      tokenHash: hashHandoffToken(handoffRawToken),
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    });
  });

  /*
   * BACK TO THE APEX DASHBOARD, NOT INTO THE NEW ACADEMY (F4.6).
   *
   * The academy lives on its own host now, and the staff session cookie is
   * host-scoped (§2.19 exception #5 — deliberately, not as a simplification).
   * Redirecting straight to `{subdomain}/dashboard` would therefore land the
   * user on a login screen seconds after signing in, with nothing on the page
   * explaining why. The apex dashboard instead confirms the academy exists by
   * listing it in the directory, and the user enters it by choosing it.
   *
   * `handoff` (Faza 5.5 / D74) rides along on this SAME redirect so the
   * directory can carry it into the ONE link that leads to this academy — see
   * `AcademyHome`/directory rendering. It is not a second redirect and not a
   * new mechanism: apex retention (D71) already stops here, this just hands the
   * page enough to bridge the click that follows.
   */
  redirect(`/dashboard?handoff=${handoffRawToken}`);
}

// --- Invitations ------------------------------------------------------------

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgPermission("members.invite");

  const [t, tv, ts] = await Promise.all([
    getTranslations("organizations.errors"),
    getTranslations("organizations.validation"),
    getTranslations("organizations.success"),
  ]);
  const parsed = inviteMemberSchema(tv).safeParse({
    email: str(formData.get("email")),
    role: str(formData.get("role")) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("generic") };
  }

  const rawToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  /**
   * What language to invite them in (spec 16.1).
   *
   * Their own choice if they already have an account; otherwise the INVITER's,
   * because an invitation is a message from this org and an org that works in
   * Polish invites in Polish. There is no third option — an invitee with no
   * account has told us nothing.
   *
   * RESOLVED BEFORE THE TRANSACTION OPENS, deliberately. Inside, this would take a
   * SECOND pooled connection while `tx` holds the first — the exact deadlock
   * features/admin/audit.ts documents. It reads nothing the transaction writes, so
   * there is no reason for it to be in there.
   *
   * §3.3 anti-enumeration is intact: the language varies with whether the invitee
   * has an account, but only the INVITEE ever sees the email — the inviter gets
   * the same "Invitation sent" either way, which is what the rule is about.
   */
  const inviteeLocale =
    (await storedLocaleForEmail(parsed.data.email)) ?? toLocale(ctx.session.user.locale);
  const actor = await resolveActor(ctx.session);

  await withTenant(ctx.org.id, async (tx) => {
    // Supersede any prior pending invite for this email so only one link is live.
    await tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitation.organizationId, ctx.org.id),
          eq(invitation.email, parsed.data.email),
          eq(invitation.status, "pending"),
        ),
      );
    const [row] = await tx
      .insert(invitation)
      .values({
        organizationId: ctx.org.id,
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash: hashToken(rawToken),
        status: "pending",
        expiresAt,
        invitedByUserId: ctx.session.user.id,
      })
      .returning({ id: invitation.id });

    await recordAudit(tx, {
      action: "member.invite",
      actor,
      organizationId: ctx.org.id,
      targetType: "invitation",
      targetId: row!.id,
      // The invitee's EMAIL, not the invitation id: an auditor asks "who was
      // invited", and a uuid answers a different question.
      targetLabel: parsed.data.email,
      metadata: withImpersonation(ctx.session, { role: parsed.data.role }),
    });

    // Enqueued INSIDE the transaction, so a rollback un-sends the invitation
    // rather than emailing a link to a row that does not exist. It also takes the
    // provider's latency out of this action: the admin's "Invitation sent"
    // no longer waits on an HTTP call that might time out.
    await enqueueEmail(
      tx,
      "invitation",
      {
        url: `${clientEnv.NEXT_PUBLIC_APP_URL}/invitations/${rawToken}`,
        orgName: ctx.org.name,
        inviterName: ctx.session.user.name ?? ctx.session.user.email,
        role: parsed.data.role,
      },
      { to: parsed.data.email, locale: inviteeLocale },
      // The invitation row's own id: re-inviting mints a NEW row (the update above
      // revokes the old one), so a genuine re-invite gets a genuinely new key and
      // is not swallowed as a duplicate.
      { dedupeKey: `invitation:${row!.id}` },
    );

    // Second channel (spec 23), for an invitee who ALREADY has an account — an
    // in-app bell alongside the email. Scoped to their PERSONAL account (they are
    // not a member of this org yet). No account → email only; the email is what
    // reaches a stranger, the notification what reaches an existing user. Same
    // `tx`, so a rollback un-sends both. `getUserByEmail` keeps §3.3 privacy: the
    // admin never learns from the result whether the invitee had an account.
    const invitee = await getUserByEmail(parsed.data.email);
    if (invitee) {
      await ensurePersonalAccount(invitee.id);
      const account = await getPersonalAccountByUserId(invitee.id);
      if (account) {
        await enqueueNotification(
          tx,
          {
            userId: invitee.id,
            organizationId: null,
            accountId: account.id,
            type: "invitation",
            params: {
              orgName: ctx.org.name,
              inviterName: ctx.session.user.name ?? ctx.session.user.email,
            },
            link: `/invitations/${rawToken}`,
          },
          { dedupeKey: `notif:invitation:${row!.id}` },
        );
      }
    }
  });

  revalidatePath("/dashboard/members");
  return { success: ts("invitationSent", { email: parsed.data.email }) };
}

export async function revokeInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invitationId = str(formData.get("invitationId"));
  const ctx = await requireOrgPermission("invitations.revoke");
  const ts = await getTranslations("organizations.success");
  const actor = await resolveActor(ctx.session);

  /*
   * Wrapped in a transaction and given a `.returning()` for the audit row (§6.4).
   *
   * The `.returning()` also fixes a pre-existing bug this change surfaced: the
   * update matched on `status = 'pending'`, so revoking an already-revoked or
   * already-accepted invitation updated ZERO rows and still reported success.
   * Auditing forced the question "what did I just revoke?", and the honest answer
   * was sometimes "nothing". Now that case returns without logging a revocation
   * that never happened — the log records reality, not intent.
   */
  await withTenant(ctx.org.id, async (tx) => {
    const [revoked] = await tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, ctx.org.id),
          eq(invitation.status, "pending"),
        ),
      )
      .returning({ id: invitation.id, email: invitation.email, role: invitation.role });
    if (!revoked) return;

    await recordAudit(tx, {
      action: "invitation.revoke",
      actor,
      organizationId: ctx.org.id,
      targetType: "invitation",
      targetId: revoked.id,
      targetLabel: revoked.email,
      metadata: withImpersonation(ctx.session, { role: revoked.role }),
    });
  });

  revalidatePath("/dashboard/members");
  return { success: ts("invitationRevoked") };
}

export async function acceptInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // The other bypass: membership is being created, so there is nothing for
  // `requireOrgAccess` to check yet. See `createOrganizationAction` above.
  requireOrgsEnabled();
  const rawToken = str(formData.get("token"));
  const session = await requireSession(`/invitations/${rawToken}`);
  const t = await getTranslations("organizations.errors");

  const invite = await getInvitationByTokenHash(hashToken(rawToken));
  if (!invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now()) {
    return { error: t("invitationInvalid") };
  }

  const org = await getOrgById(invite.organizationId);
  if (!org) return { error: t("invitationInvalid") };

  const actor = await resolveActor(session);
  const handoffRawToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");

  // Re-enters tenant context with the org the token resolved to, so both writes
  // below are subject to `membership`/`invitation` WITH CHECK. The only bypass in
  // this flow covered the token lookup itself (`./cross-tenant.ts`), which cannot
  // name a tenant because the tenant is its output.
  await withTenant(invite.organizationId, async (tx) => {
    // Bearer-token accept by the authenticated session holder (documented policy).
    await tx
      .insert(membership)
      .values({
        organizationId: invite.organizationId,
        userId: session.user.id,
        role: invite.role,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [membership.organizationId, membership.userId],
        set: { role: invite.role, status: "active", updatedAt: new Date() },
      });
    await tx
      .update(invitation)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(invitation.id, invite.id));

    // The actor is the JOINER, not the admin who invited them — they are the one
    // who acted here. The invitation row already records who did the inviting, and
    // a member who appears in the org with no row explaining how is precisely the
    // gap an auditor notices.
    await recordAudit(tx, {
      action: "member.join",
      actor,
      organizationId: invite.organizationId,
      targetType: "membership",
      targetId: session.user.id,
      targetLabel: session.user.email,
      metadata: withImpersonation(session, { role: invite.role, invitationId: invite.id }),
    });
    // Plan Faza 5.5 / decyzja D74 — see the redirect comment below.
    await insertHandoff(tx, {
      organizationId: invite.organizationId,
      userId: session.user.id,
      tokenHash: hashHandoffToken(handoffRawToken),
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    });
  });

  // The apex directory, for the same reason as `createOrganizationAction` above:
  // the invitee's session does not exist on the academy's host yet. `handoff`
  // rides the same redirect (Faza 5.5 / D74) — see that function's comment.
  redirect(`/dashboard?handoff=${handoffRawToken}`);
}

// --- Member management ------------------------------------------------------

export async function updateMemberRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgPermission("members.update_role");
  const [t, ts] = await Promise.all([
    getTranslations("organizations.errors"),
    getTranslations("organizations.success"),
  ]);

  const parsed = updateRoleSchema().safeParse({
    membershipId: str(formData.get("membershipId")),
    role: str(formData.get("role")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("generic") };
  }

  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, async (tx) => {
      const [target] = await tx
        .select()
        .from(membership)
        .where(
          and(
            eq(membership.id, parsed.data.membershipId),
            eq(membership.organizationId, ctx.org.id),
          ),
        )
        .for("update");
      if (!target) throw new LastOwnerError();

      // Demoting the sole active Owner is forbidden (spec 3.2/3.4).
      if (target.role === "owner" && parsed.data.role !== "owner") {
        if ((await lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
      }
      await tx
        .update(membership)
        .set({ role: parsed.data.role, updatedAt: new Date() })
        .where(eq(membership.id, target.id));

      // `tx`, never `db` — see the module header. This reads inside an open
      // transaction, so a second connection here would deadlock against it.
      const [targetUser] = await tx
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, target.userId))
        .limit(1);

      await recordAudit(tx, {
        action: "member.role_change",
        actor,
        organizationId: ctx.org.id,
        targetType: "membership",
        targetId: target.userId,
        targetLabel: targetUser?.email ?? target.userId,
        metadata: withImpersonation(ctx.session, {
          // `target` was SELECTed FOR UPDATE above, so `from` is the true
          // pre-image and cannot have been changed by a concurrent writer
          // between the read and the write. §6.4's "stara wartość → nowa wartość".
          changes: changed({ role: target.role }, { role: parsed.data.role }, ["role"]),
        }),
      });
    });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { error: t("lastOwnerDemote") };
    }
    throw error;
  }

  revalidatePath("/dashboard/members");
  return { success: ts("roleUpdated") };
}

export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgPermission("members.remove");
  const [t, ts] = await Promise.all([
    getTranslations("organizations.errors"),
    getTranslations("organizations.success"),
  ]);
  const membershipId = str(formData.get("membershipId"));
  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, async (tx) => {
      const [target] = await tx
        .select()
        .from(membership)
        .where(and(eq(membership.id, membershipId), eq(membership.organizationId, ctx.org.id)))
        .for("update");
      if (!target) throw new LastOwnerError();

      if (target.role === "owner" && target.status === "active") {
        if ((await lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
      }

      // Resolved BEFORE the delete: the membership row is about to stop existing,
      // and the audit entry needs its role. The user row survives, but reading it
      // after the delete would be relying on ordering for no benefit.
      const [targetUser] = await tx
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, target.userId))
        .limit(1);

      await tx.delete(membership).where(eq(membership.id, target.id));

      await recordAudit(tx, {
        action: "member.remove",
        actor,
        organizationId: ctx.org.id,
        targetType: "membership",
        targetId: target.userId,
        targetLabel: targetUser?.email ?? target.userId,
        metadata: withImpersonation(ctx.session, { role: target.role }),
      });
    });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { error: t("lastOwnerRemove") };
    }
    throw error;
  }

  revalidatePath("/dashboard/members");
  return { success: ts("memberRemoved") };
}

/*
 * NO PARAMETERS since F4.6, and that is the visible shape of the change: the
 * academy comes from the request host, and the posted `slug` was the only field
 * these two actions ever read. `useActionState` still calls them with
 * (prevState, formData) — JavaScript simply ignores arguments a function does
 * not declare, and declaring them only to leave them unread invites the next
 * reader to start using them again.
 */
export async function leaveOrganizationAction(): Promise<ActionState> {
  const ctx = await requireOrgPermission("organization.leave");
  const t = await getTranslations("organizations.errors");
  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, async (tx) => {
      if (ctx.membership.role === "owner") {
        if ((await lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
      }
      await tx.delete(membership).where(eq(membership.id, ctx.membership.id));

      // Actor and target are the same person — that is the distinction between
      // `member.leave` and `member.remove`, and why they are separate actions
      // rather than one with a flag.
      await recordAudit(tx, {
        action: "member.leave",
        actor,
        organizationId: ctx.org.id,
        targetType: "membership",
        targetId: ctx.session.user.id,
        targetLabel: ctx.session.user.email,
        metadata: withImpersonation(ctx.session, { role: ctx.membership.role }),
      });
    });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { error: t("lastOwnerLeave") };
    }
    throw error;
  }

  /*
   * The APEX dashboard, absolute — this action runs on the academy's host, and a
   * relative "/dashboard" would land back on the panel of an academy the caller
   * has just left or deleted. The honest answer there is a 403/404; the apex
   * directory is where they actually belong.
   */
  redirect(await apexUrl("/dashboard"));
}

// --- Organization settings --------------------------------------------------

export async function updateOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgPermission("organization.update");

  const [t, tv, ts] = await Promise.all([
    getTranslations("organizations.errors"),
    getTranslations("organizations.validation"),
    getTranslations("organizations.success"),
  ]);
  const parsedName = createOrgSchema(tv).shape.name.safeParse(str(formData.get("name")));
  if (!parsedName.success) {
    return { error: parsedName.error.issues[0]?.message ?? t("generic") };
  }

  const rawNewSlug = str(formData.get("newSlug")).trim();
  let nextSlug = ctx.org.slug;
  if (rawNewSlug && rawNewSlug !== ctx.org.slug) {
    const parsedSlug = slugSchema(tv).safeParse(rawNewSlug);
    if (!parsedSlug.success) {
      return { error: parsedSlug.error.issues[0]?.message ?? t("generic") };
    }
    if (await isSlugTaken(parsedSlug.data)) {
      return { error: t("slugTaken") };
    }
    nextSlug = parsedSlug.data;
  }

  const actor = await resolveActor(ctx.session);

  // Wrapped in a transaction purely so the audit row is atomic with the update
  // (Rule A). A bare `db.update` plus a separate insert would leave a window
  // where the org is renamed and nothing says who did it.
  await db.transaction(async (tx) => {
    await tx
      .update(organization)
      .set({ name: parsedName.data, slug: nextSlug, updatedAt: new Date() })
      .where(eq(organization.id, ctx.org.id));

    await recordAudit(tx, {
      action: "organization.update",
      actor,
      organizationId: ctx.org.id,
      targetType: "organization",
      targetId: ctx.org.id,
      targetLabel: nextSlug,
      metadata: withImpersonation(ctx.session, {
        changes: changed(
          { name: ctx.org.name, slug: ctx.org.slug },
          { name: parsedName.data, slug: nextSlug },
          ["name", "slug"],
        ),
      }),
    });
  });

  /*
   * No redirect on slug change any more (F4.6). The panel is addressed by HOST
   * now, and `subdomain` is a separate column that this action does not touch —
   * so renaming the slug no longer moves the page the user is looking at. It is
   * an internal identifier at this point (§1.2 retires it from panel routing),
   * which is also why it stays editable: nothing a parent ever sees depends on it.
   */
  revalidatePath("/dashboard/settings");
  return { success: ts("organizationUpdated") };
}

export async function deleteOrganizationAction(): Promise<ActionState> {
  const ctx = await requireOrgPermission("organization.delete");
  const actor = await resolveActor(ctx.session);

  await db.transaction(async (tx) => {
    // Soft delete (spec 11.3) — the row is retained for the retention window.
    await tx
      .update(organization)
      .set({ deletedAt: new Date() })
      .where(eq(organization.id, ctx.org.id));

    // Shares the `organization.delete` action name with the super-admin panel's
    // version deliberately: it is the same event. `actorType` is what separates
    // "the owner closed their org" from "an operator deleted it", which is the
    // whole reason §6.4 asks for an actor model rather than more action names.
    await recordAudit(tx, {
      action: "organization.delete",
      actor,
      organizationId: ctx.org.id,
      targetType: "organization",
      targetId: ctx.org.id,
      targetLabel: ctx.org.slug,
      metadata: withImpersonation(ctx.session),
    });
  });

  /*
   * The APEX dashboard, absolute — this action runs on the academy's host, and a
   * relative "/dashboard" would land back on the panel of an academy the caller
   * has just left or deleted. The honest answer there is a 403/404; the apex
   * directory is where they actually belong.
   */
  redirect(await apexUrl("/dashboard"));
}
