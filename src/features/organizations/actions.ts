"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash, randomUUID } from "node:crypto";

import { enqueueEmail } from "@/features/emails/send";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation, membership, organization } from "@/lib/db/schema";
import { clientEnv } from "@/lib/env/client";
import { requireOrgPermission } from "./context";
import { getInvitationByTokenHash, getOrgById, isSlugTaken } from "./data";
import { createOrgSchema, inviteMemberSchema, slugSchema, updateRoleSchema } from "./schema";
import { resolveUniqueSlug } from "./slug";

/**
 * Organization server actions (spec 3.2–3.4). Every mutation resolves the active
 * org from the posted `slug` and passes through `requireOrgPermission` before
 * touching data (spec 4.2). Business invariants that must hold under concurrency
 * — chiefly "an org always keeps ≥1 Owner" (§3.2/§3.4) — are enforced inside a
 * transaction that locks the owner rows (`FOR UPDATE`).
 */

export type ActionState = { error?: string; success?: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (spec 3.3)

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
  const session = await requireSession("/orgs/new");
  const parsed = createOrgSchema.safeParse({
    name: str(formData.get("name")),
    slug: str(formData.get("slug")) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const slug = await resolveUniqueSlug(parsed.data.slug ?? parsed.data.name, isSlugTaken);

  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({ name: parsed.data.name, slug, createdByUserId: session.user.id })
      .returning({ id: organization.id });
    await tx.insert(membership).values({
      organizationId: org!.id,
      userId: session.user.id,
      role: "owner",
      status: "active",
    });
  });

  redirect(`/orgs/${slug}`);
}

// --- Invitations ------------------------------------------------------------

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const ctx = await requireOrgPermission(slug, "members.invite");

  const parsed = inviteMemberSchema.safeParse({
    email: str(formData.get("email")),
    role: str(formData.get("role")) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const rawToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.transaction(async (tx) => {
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
      { to: parsed.data.email },
      // The invitation row's own id: re-inviting mints a NEW row (the update above
      // revokes the old one), so a genuine re-invite gets a genuinely new key and
      // is not swallowed as a duplicate.
      { dedupeKey: `invitation:${row!.id}` },
    );
  });

  revalidatePath(`/orgs/${slug}/members`);
  return { success: `Invitation sent to ${parsed.data.email}.` };
}

export async function revokeInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const invitationId = str(formData.get("invitationId"));
  const ctx = await requireOrgPermission(slug, "invitations.revoke");

  await db
    .update(invitation)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.organizationId, ctx.org.id),
        eq(invitation.status, "pending"),
      ),
    );

  revalidatePath(`/orgs/${slug}/members`);
  return { success: "Invitation revoked." };
}

export async function acceptInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawToken = str(formData.get("token"));
  const session = await requireSession(`/invitations/${rawToken}`);

  const invite = await getInvitationByTokenHash(hashToken(rawToken));
  if (!invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now()) {
    return { error: "This invitation is no longer valid." };
  }

  const org = await getOrgById(invite.organizationId);
  if (!org) return { error: "This invitation is no longer valid." };

  await db.transaction(async (tx) => {
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
  });

  redirect(`/orgs/${org.slug}`);
}

// --- Member management ------------------------------------------------------

export async function updateMemberRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const ctx = await requireOrgPermission(slug, "members.update_role");

  const parsed = updateRoleSchema.safeParse({
    membershipId: str(formData.get("membershipId")),
    role: str(formData.get("role")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  try {
    await db.transaction(async (tx) => {
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
    });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { error: "An organization must keep at least one owner." };
    }
    throw error;
  }

  revalidatePath(`/orgs/${slug}/members`);
  return { success: "Role updated." };
}

export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const ctx = await requireOrgPermission(slug, "members.remove");
  const membershipId = str(formData.get("membershipId"));

  try {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(membership)
        .where(and(eq(membership.id, membershipId), eq(membership.organizationId, ctx.org.id)))
        .for("update");
      if (!target) throw new LastOwnerError();

      if (target.role === "owner" && target.status === "active") {
        if ((await lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
      }
      await tx.delete(membership).where(eq(membership.id, target.id));
    });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { error: "You can't remove the last owner of an organization." };
    }
    throw error;
  }

  revalidatePath(`/orgs/${slug}/members`);
  return { success: "Member removed." };
}

export async function leaveOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const ctx = await requireOrgPermission(slug, "organization.leave");

  try {
    await db.transaction(async (tx) => {
      if (ctx.membership.role === "owner") {
        if ((await lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
      }
      await tx.delete(membership).where(eq(membership.id, ctx.membership.id));
    });
  } catch (error) {
    if (error instanceof LastOwnerError) {
      return { error: "Transfer ownership before leaving — an org needs at least one owner." };
    }
    throw error;
  }

  redirect("/dashboard");
}

// --- Organization settings --------------------------------------------------

export async function updateOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const ctx = await requireOrgPermission(slug, "organization.update");

  const parsedName = createOrgSchema.shape.name.safeParse(str(formData.get("name")));
  if (!parsedName.success) {
    return { error: parsedName.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const rawNewSlug = str(formData.get("newSlug")).trim();
  let nextSlug = ctx.org.slug;
  if (rawNewSlug && rawNewSlug !== ctx.org.slug) {
    const parsedSlug = slugSchema.safeParse(rawNewSlug);
    if (!parsedSlug.success) {
      return { error: parsedSlug.error.issues[0]?.message ?? GENERIC_ERROR };
    }
    if (await isSlugTaken(parsedSlug.data)) {
      return { error: "That slug is already taken." };
    }
    nextSlug = parsedSlug.data;
  }

  await db
    .update(organization)
    .set({ name: parsedName.data, slug: nextSlug, updatedAt: new Date() })
    .where(eq(organization.id, ctx.org.id));

  if (nextSlug !== ctx.org.slug) {
    redirect(`/orgs/${nextSlug}/settings`);
  }
  revalidatePath(`/orgs/${slug}/settings`);
  return { success: "Organization updated." };
}

export async function deleteOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = str(formData.get("slug"));
  const ctx = await requireOrgPermission(slug, "organization.delete");

  // Soft delete (spec 11.3) — the row is retained for the retention window.
  await db
    .update(organization)
    .set({ deletedAt: new Date() })
    .where(eq(organization.id, ctx.org.id));

  redirect("/dashboard");
}
