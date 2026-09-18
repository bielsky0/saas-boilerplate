import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@repo/validation";
import {
  auditLog,
  endOfDay,
  invitation,
  likePattern,
  membership,
  organization,
  parseDate,
  toPaged,
  user,
  type Db,
} from "@repo/db";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { badRequest, conflict, notFound, validationFailed } from "../common/http";
import type { RequestSession } from "../auth/auth-engine";
import {
  ensurePersonalAccount,
  getPersonalAccountByUserId,
  recipientLocale,
  storedLocaleForEmail,
} from "../auth/auth-enqueue";
import { kickDrain } from "../jobs/runner";
import { type Permission, type Role } from "@repo/contracts";
import { requireOrgMember } from "../tenancy/access";
import { changed, recordAudit, resolveActor } from "./audit";
import { enqueueInvitationEmail, enqueueInvitationNotification } from "./queue";
import { resolveUniqueSlug } from "./slug";

/**
 * Organizations flows (spec 3.2–3.4, 4.2, 6.4) — the Nest twin of the web app's
 * `features/organizations/actions.ts` + `data.ts` + `audit-data.ts`.
 *
 * Same rules, in the same order:
 * - validation first (spec 22.2, English backstops — the client pre-validates
 *   with translated factories, so these messages only surface on hand-built
 *   requests), `MULTI_TENANCY_MODE` + membership + RBAC second;
 * - "an org always keeps ≥1 Owner" enforced inside a transaction that locks
 *   the owner rows (`FOR UPDATE`), so concurrent demotions serialize;
 * - `targetLabel` lookups that belong inside a transaction use `tx`, never
 *   `db` (a query inside would take a second pooled connection while `tx`
 *   holds the first — the deadlock `features/admin/audit.ts` documents);
 * - invite enqueues `email.send` + `notification.create` INSIDE the same
 *   transaction (a rollback un-sends both); the drain kick afterwards is
 *   best-effort (cron is the guarantee).
 *
 * Throws `HttpException`s with the OpenAPI envelope (`{ error, issues? }`).
 * `409` codes are distinct (`LAST_OWNER` vs `SLUG_TAKEN`) so the client maps
 * each to its own form message.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (spec 3.3)
const AUDIT_PAGE_SIZE = 25;

/** Thrown inside a transaction to abort it and surface a 409 instead of a 403. */
class LastOwnerError extends Error {}

/** Server-side English backstops (spec 22.2): rules mirror the web schemas. */
const slugRule = z.string().trim().min(SLUG_MIN).max(SLUG_MAX).regex(SLUG_PATTERN);
const createOrgBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugRule.optional(),
});
const updateOrgBodySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  newSlug: slugRule.optional(),
});
const inviteBodySchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(["admin", "member"]).default("member"),
});
const updateRoleBodySchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});
const auditQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  from: z.string().trim().catch(""),
  to: z.string().trim().catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export interface RequestInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface OrgContext {
  org: typeof organization.$inferSelect;
  membership: typeof membership.$inferSelect;
  role: Role;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  private orgsEnabled(): boolean {
    return this.config.MULTI_TENANCY_MODE !== "disabled";
  }

  private webURL(): string {
    return this.config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  private kickDrain(): void {
    kickDrain();
  }

  private async isSlugTaken(slug: string): Promise<boolean> {
    // ALL orgs including soft-deleted ones — the unique constraint spans them.
    const [row] = await this.db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    return Boolean(row);
  }

  /**
   * The single backend chokepoint: resolves the active org from the slug and
   * enforces membership + permission. Delegates to `tenancy/access` — the
   * shared implementation every org-scoped flow uses (spec 4.2). 404 for
   * unknown/disabled (never 403 — a 403 would admit the feature exists), 403
   * for non-members and missing permissions.
   */
  private async requireOrgContext(
    session: RequestSession,
    slug: string,
    permission?: Permission,
  ): Promise<OrgContext> {
    return requireOrgMember(this.db, session, slug, this.orgsEnabled(), permission);
  }

  /** Count active owners, locking those rows so concurrent demotions serialize. */
  private async lockActiveOwnerCount(tx: Tx, organizationId: string): Promise<number> {
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

  // --- Create / list / read ---------------------------------------------------

  async createOrganization(
    session: RequestSession,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ id: string; name: string; slug: string }> {
    // The bypass action (there is no org yet) carries the §1.4 guard itself.
    if (!this.orgsEnabled()) notFound("Organization not found");
    const parsed = createOrgBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const slug = await resolveUniqueSlug(parsed.data.slug ?? parsed.data.name, (s) =>
      this.isSlugTaken(s),
    );
    const actor = resolveActor(session);

    const orgId = await this.db.transaction(async (tx) => {
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
      // The genesis row: without it an org's trail begins mid-story.
      await recordAudit(
        tx,
        {
          action: "organization.create",
          actor,
          organizationId: org!.id,
          targetType: "organization",
          targetId: org!.id,
          targetLabel: slug,
          metadata: { name: parsed.data.name },
        },
        req,
      );
      return org!.id;
    });

    return { id: orgId, name: parsed.data.name, slug };
  }

  async listOrganizations(
    session: RequestSession,
  ): Promise<{ items: { id: string; name: string; slug: string; role: string }[] }> {
    if (!this.orgsEnabled()) return { items: [] };
    const rows = await this.db
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
          eq(membership.userId, session.user.id),
          eq(membership.status, "active"),
          isNull(organization.deletedAt),
        ),
      )
      .orderBy(organization.name);
    return { items: rows };
  }

  async getOrganization(
    session: RequestSession,
    slug: string,
  ): Promise<{ id: string; name: string; slug: string; role: string }> {
    const ctx = await this.requireOrgContext(session, slug);
    return { id: ctx.org.id, name: ctx.org.name, slug: ctx.org.slug, role: ctx.role };
  }

  // --- Settings ----------------------------------------------------------------

  async updateOrganization(
    session: RequestSession,
    slug: string,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ id: string; name: string; slug: string }> {
    const ctx = await this.requireOrgContext(session, slug, "organization.update");
    const parsed = updateOrgBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const nextName = parsed.data.name ?? ctx.org.name;
    let nextSlug = ctx.org.slug;
    const rawNewSlug = parsed.data.newSlug?.trim();
    if (rawNewSlug && rawNewSlug !== ctx.org.slug) {
      // Re-validate through the rule (the schema already did, but the field is
      // optional there — an empty trim must not become the slug).
      const slugParsed = slugRule.safeParse(rawNewSlug);
      if (!slugParsed.success) validationFailed(slugParsed.error);
      if (await this.isSlugTaken(slugParsed.data)) conflict("SLUG_TAKEN");
      nextSlug = slugParsed.data;
    }

    const actor = resolveActor(session);

    // Wrapped in a transaction purely so the audit row is atomic with the
    // update (Rule A) — and the changes diff is computed from live pre-images.
    await this.db.transaction(async (tx) => {
      await tx
        .update(organization)
        .set({ name: nextName, slug: nextSlug, updatedAt: new Date() })
        .where(eq(organization.id, ctx.org.id));

      await recordAudit(
        tx,
        {
          action: "organization.update",
          actor,
          organizationId: ctx.org.id,
          targetType: "organization",
          targetId: ctx.org.id,
          targetLabel: nextSlug,
          metadata: {
            changes: changed(
              { name: ctx.org.name, slug: ctx.org.slug },
              { name: nextName, slug: nextSlug },
              ["name", "slug"],
            ),
          },
        },
        req,
      );
    });

    return { id: ctx.org.id, name: nextName, slug: nextSlug };
  }

  async deleteOrganization(session: RequestSession, slug: string, req: RequestInfo): Promise<void> {
    const ctx = await this.requireOrgContext(session, slug, "organization.delete");
    const actor = resolveActor(session);

    await this.db.transaction(async (tx) => {
      // Soft delete (spec 11.3) — the row is retained for the retention window.
      await tx
        .update(organization)
        .set({ deletedAt: new Date() })
        .where(eq(organization.id, ctx.org.id));

      // Shares the `organization.delete` action name with the super-admin
      // panel's version deliberately: same event, `actorType` separates
      // "the owner closed their org" from "an operator deleted it".
      await recordAudit(
        tx,
        {
          action: "organization.delete",
          actor,
          organizationId: ctx.org.id,
          targetType: "organization",
          targetId: ctx.org.id,
          targetLabel: ctx.org.slug,
        },
        req,
      );
    });
  }

  // --- Members -----------------------------------------------------------------

  async listMembers(
    session: RequestSession,
    slug: string,
  ): Promise<{
    items: {
      id: string;
      userId: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      createdAt: string;
    }[];
  }> {
    const ctx = await this.requireOrgContext(session, slug);
    const rows = await this.db
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
      .where(eq(membership.organizationId, ctx.org.id))
      .orderBy(desc(membership.createdAt));
    return {
      items: rows.map((m) => ({
        id: m.membershipId,
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: m.role,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async updateMemberRole(
    session: RequestSession,
    slug: string,
    memberId: string,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ id: string; role: string }> {
    const ctx = await this.requireOrgContext(session, slug, "members.update_role");
    const parsed = updateRoleBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);
    const actor = resolveActor(session);

    try {
      await this.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(membership)
          .where(and(eq(membership.id, memberId), eq(membership.organizationId, ctx.org.id)))
          .for("update");
        if (!target) throw new LastOwnerError();

        // Demoting the sole active Owner is forbidden (spec 3.2/3.4).
        if (target.role === "owner" && parsed.data.role !== "owner") {
          if ((await this.lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
        }
        await tx
          .update(membership)
          .set({ role: parsed.data.role, updatedAt: new Date() })
          .where(eq(membership.id, target.id));

        // `tx`, never `db` — this reads inside an open transaction.
        const [targetUser] = await tx
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, target.userId))
          .limit(1);

        await recordAudit(
          tx,
          {
            action: "member.role_change",
            actor,
            organizationId: ctx.org.id,
            targetType: "membership",
            targetId: target.userId,
            targetLabel: targetUser?.email ?? target.userId,
            metadata: {
              // `target` was SELECTed FOR UPDATE above, so `from` is the true
              // pre-image. §6.4's "stara wartość → nowa wartość".
              changes: changed({ role: target.role }, { role: parsed.data.role }, ["role"]),
            },
          },
          req,
        );
      });
    } catch (error) {
      if (error instanceof LastOwnerError) conflict("LAST_OWNER");
      throw error;
    }

    return { id: memberId, role: parsed.data.role };
  }

  async removeMember(
    session: RequestSession,
    slug: string,
    memberId: string,
    req: RequestInfo,
  ): Promise<void> {
    const ctx = await this.requireOrgContext(session, slug, "members.remove");
    const actor = resolveActor(session);

    try {
      await this.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(membership)
          .where(and(eq(membership.id, memberId), eq(membership.organizationId, ctx.org.id)))
          .for("update");
        if (!target) throw new LastOwnerError();

        if (target.role === "owner" && target.status === "active") {
          if ((await this.lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
        }

        // Resolved BEFORE the delete: the membership row is about to stop
        // existing, and the audit entry needs its role.
        const [targetUser] = await tx
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, target.userId))
          .limit(1);

        await tx.delete(membership).where(eq(membership.id, target.id));

        await recordAudit(
          tx,
          {
            action: "member.remove",
            actor,
            organizationId: ctx.org.id,
            targetType: "membership",
            targetId: target.userId,
            targetLabel: targetUser?.email ?? target.userId,
            metadata: { role: target.role },
          },
          req,
        );
      });
    } catch (error) {
      if (error instanceof LastOwnerError) conflict("LAST_OWNER");
      throw error;
    }
  }

  async leaveOrganization(session: RequestSession, slug: string, req: RequestInfo): Promise<void> {
    const ctx = await this.requireOrgContext(session, slug, "organization.leave");
    const actor = resolveActor(session);

    try {
      await this.db.transaction(async (tx) => {
        if (ctx.membership.role === "owner") {
          if ((await this.lockActiveOwnerCount(tx, ctx.org.id)) <= 1) throw new LastOwnerError();
        }
        await tx.delete(membership).where(eq(membership.id, ctx.membership.id));

        // Actor and target are the same person — the distinction between
        // `member.leave` and `member.remove`, and why they are separate
        // actions rather than one with a flag.
        await recordAudit(
          tx,
          {
            action: "member.leave",
            actor,
            organizationId: ctx.org.id,
            targetType: "membership",
            targetId: session.user.id,
            targetLabel: session.user.email,
            metadata: { role: ctx.membership.role },
          },
          req,
        );
      });
    } catch (error) {
      if (error instanceof LastOwnerError) conflict("LAST_OWNER");
      throw error;
    }
  }

  // --- Invitations ---------------------------------------------------------------

  async createInvitation(
    session: RequestSession,
    headers: Headers | null,
    slug: string,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ id: string; email: string; role: string; status: string }> {
    const ctx = await this.requireOrgContext(session, slug, "members.invite");
    const parsed = inviteBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const rawToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    // What language to invite them in (spec 16.1): their own choice if they
    // already have an account; otherwise the INVITER's. RESOLVED BEFORE THE
    // TRANSACTION OPENS — inside, this would take a second pooled connection.
    // §3.3 anti-enumeration is intact: only the invitee ever sees the email.
    const inviteeStored = await storedLocaleForEmail(this.db, parsed.data.email);
    const inviteeLocale =
      inviteeStored ?? (await recipientLocale(this.db, session.user.id, headers));
    const actor = resolveActor(session);

    const invitationId = await this.db.transaction(async (tx) => {
      // Supersede prior pending invites so only one link is live.
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
          invitedByUserId: session.user.id,
        })
        .returning({ id: invitation.id });

      await recordAudit(
        tx,
        {
          action: "member.invite",
          actor,
          organizationId: ctx.org.id,
          targetType: "invitation",
          targetId: row!.id,
          // The invitee's EMAIL, not the id: an auditor asks "who was invited".
          targetLabel: parsed.data.email,
          metadata: { role: parsed.data.role },
        },
        req,
      );

      // Enqueued INSIDE the transaction: a rollback un-sends the invitation.
      await enqueueInvitationEmail(
        tx,
        {
          url: `${this.webURL()}/invitations/${rawToken}`,
          orgName: ctx.org.name,
          inviterName: session.user.email,
          role: parsed.data.role,
        },
        { to: parsed.data.email, locale: inviteeLocale },
        // The invitation row's own id: a genuine re-invite mints a new row and
        // a genuinely new key, never swallowed as a duplicate.
        { dedupeKey: `invitation:${row!.id}` },
      );

      // Second channel (spec 23) for an invitee who ALREADY has an account.
      // Scoped to their PERSONAL account. `getUserByEmail` keeps §3.3 privacy:
      // the admin never learns from the result whether the invitee had one.
      const [invitee] = await this.db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, parsed.data.email), isNull(user.deletedAt)))
        .limit(1);
      if (invitee) {
        await ensurePersonalAccount(this.db, invitee.id);
        const account = await getPersonalAccountByUserId(this.db, invitee.id);
        if (account) {
          await enqueueInvitationNotification(
            tx,
            {
              userId: invitee.id,
              accountId: account.id,
              orgName: ctx.org.name,
              inviterName: session.user.email,
              link: `/invitations/${rawToken}`,
            },
            { dedupeKey: `notif:invitation:${row!.id}` },
          );
        }
      }

      return row!.id;
    });

    // Best-effort: the queue still drains via cron if the kick fails or if no
    // CRON_SECRET is configured (spec 12 — cron is the guarantee).
    this.kickDrain();

    return {
      id: invitationId,
      email: parsed.data.email,
      role: parsed.data.role,
      status: "pending",
    };
  }

  async listInvitations(
    session: RequestSession,
    slug: string,
  ): Promise<{
    items: { id: string; email: string; role: string; status: string; expiresAt: string }[];
  }> {
    const ctx = await this.requireOrgContext(session, slug, "invitations.revoke");
    const rows = await this.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(and(eq(invitation.organizationId, ctx.org.id), eq(invitation.status, "pending")))
      .orderBy(desc(invitation.createdAt));
    return {
      items: rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() })),
    };
  }

  async revokeInvitation(
    session: RequestSession,
    slug: string,
    invitationId: string,
    req: RequestInfo,
  ): Promise<void> {
    const ctx = await this.requireOrgContext(session, slug, "invitations.revoke");
    const actor = resolveActor(session);

    // The `.returning()` fixes the silent no-op this change surfaced in web:
    // revoking an already-revoked/accepted invitation updated ZERO rows and
    // still reported success. Now that case returns without logging a
    // revocation that never happened.
    await this.db.transaction(async (tx) => {
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

      await recordAudit(
        tx,
        {
          action: "invitation.revoke",
          actor,
          organizationId: ctx.org.id,
          targetType: "invitation",
          targetId: revoked.id,
          targetLabel: revoked.email,
          metadata: { role: revoked.role },
        },
        req,
      );
    });
  }

  /**
   * Public invitation lookup for the accept landing (spec 3.3, faza 2.8) — the
   * Nest twin of web's `getInvitationWithValidity` + `getOrgById`.
   *
   * No session: the page is public by design (it offers sign-in/sign-up to the
   * anonymous visitor). `valid: false` covers every dead end — unknown token,
   * non-pending, expired, missing org, orgs disabled — so the response cannot
   * distinguish them (the token itself is unguessable; the page never reveals
   * whether the invited email has an account).
   */
  async getInvitationByToken(
    token: string,
  ): Promise<{ valid: boolean; orgName: string | null; role: string | null }> {
    const dead = { valid: false, orgName: null, role: null };
    if (!this.orgsEnabled() || !token) return dead;

    const [invite] = await this.db
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, hashToken(token)))
      .limit(1);
    if (!invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now()) {
      return dead;
    }

    const [org] = await this.db
      .select({ name: organization.name })
      .from(organization)
      .where(and(eq(organization.id, invite.organizationId), isNull(organization.deletedAt)))
      .limit(1);
    if (!org) return dead;
    return { valid: true, orgName: org.name, role: invite.role };
  }

  async acceptInvitation(
    session: RequestSession,
    token: string,
    req: RequestInfo,
  ): Promise<{ slug: string }> {
    // The bypass: membership is being created, so there is nothing for the
    // org guard to check yet. Carries the §1.4 guard itself.
    if (!this.orgsEnabled()) notFound("Organization not found");
    if (!token) badRequest("INVALID_TOKEN");

    const [invite] = await this.db
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, hashToken(token)))
      .limit(1);
    if (!invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now()) {
      badRequest("INVALID_TOKEN");
    }

    const [org] = await this.db
      .select()
      .from(organization)
      .where(and(eq(organization.id, invite.organizationId), isNull(organization.deletedAt)))
      .limit(1);
    if (!org) badRequest("INVALID_TOKEN");

    const actor = resolveActor(session);

    await this.db.transaction(async (tx) => {
      // Bearer-token accept by the authenticated session holder.
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

      // The actor is the JOINER, not the admin who invited them.
      await recordAudit(
        tx,
        {
          action: "member.join",
          actor,
          organizationId: invite.organizationId,
          targetType: "membership",
          targetId: session.user.id,
          targetLabel: session.user.email,
          metadata: { role: invite.role, invitationId: invite.id },
        },
        req,
      );
    });

    return { slug: org.slug };
  }

  // --- Audit trail ------------------------------------------------------------------

  async listAuditLogs(
    session: RequestSession,
    slug: string,
    query: unknown,
  ): Promise<{
    items: {
      id: string;
      action: string;
      actorType: string;
      actorEmail: string;
      targetType: string;
      targetLabel: string;
      metadata: Record<string, unknown> | null;
      createdAt: string;
    }[];
    page: number;
    hasNext: boolean;
  }> {
    const ctx = await this.requireOrgContext(session, slug, "audit.read");
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success) validationFailed(parsed.error);
    const q = parsed.data;

    // The owner filter leads and is never conditional. Rows with
    // `organizationId IS NULL` (system events) are excluded automatically.
    const filters: SQL[] = [eq(auditLog.organizationId, ctx.org.id)];

    if (q.q) {
      const pattern = likePattern(q.q);
      const match = or(
        ilike(auditLog.actorEmail, pattern),
        ilike(auditLog.targetLabel, pattern),
        ilike(auditLog.action, pattern),
      );
      if (match) filters.push(match);
    }

    const from = parseDate(q.from);
    if (from) filters.push(gte(auditLog.createdAt, from));
    const to = parseDate(q.to);
    if (to) filters.push(lte(auditLog.createdAt, endOfDay(to)));

    const rows = await this.db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorType: auditLog.actorType,
        actorEmail: auditLog.actorEmail,
        targetType: auditLog.targetType,
        targetLabel: auditLog.targetLabel,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(and(...filters))
      .orderBy(desc(auditLog.createdAt))
      // +1 to learn whether a next page exists — see `toPaged`.
      .limit(AUDIT_PAGE_SIZE + 1)
      .offset(q.page * AUDIT_PAGE_SIZE);

    const paged = toPaged(rows, q.page, AUDIT_PAGE_SIZE);
    return {
      items: paged.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      page: paged.page,
      hasNext: paged.hasNext,
    };
  }

  // --- Dev seam ------------------------------------------------------------------------

  /**
   * Test-only org seeder (spec 14.1) — the Nest twin of web's
   * `/api/dev/seed-org`. Creates an org owned by an existing seeded user.
   */
  async seedOrg(body: {
    ownerEmail?: string;
    name?: string;
    slug?: string;
    members?: { email: string; role: string }[];
  }): Promise<{ ok: true; slug: string; orgId: string }> {
    if (!body.ownerEmail) {
      throw new HttpException({ error: "ownerEmail is required" }, HttpStatus.BAD_REQUEST);
    }

    const members = body.members ?? [];
    const emails = [body.ownerEmail, ...members.map((m) => m.email)];
    const users = await this.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, emails));
    const idByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    const ownerId = idByEmail.get(body.ownerEmail.toLowerCase());
    if (!ownerId) {
      throw new HttpException(
        { error: `owner ${body.ownerEmail} not found` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const name = body.name ?? "E2E Org";
    const slug = await resolveUniqueSlug(body.slug ?? name, (s) => this.isSlugTaken(s));

    const result = await this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organization)
        .values({ name, slug, createdByUserId: ownerId })
        .returning({ id: organization.id, slug: organization.slug });
      await tx
        .insert(membership)
        .values({ organizationId: org!.id, userId: ownerId, role: "owner", status: "active" });
      for (const m of members) {
        const uid = idByEmail.get(m.email.toLowerCase());
        if (!uid) continue;
        await tx
          .insert(membership)
          .values({ organizationId: org!.id, userId: uid, role: m.role, status: "active" })
          .onConflictDoNothing();
      }
      return org!;
    });

    return { ok: true, slug: result.slug, orgId: result.id };
  }
}
