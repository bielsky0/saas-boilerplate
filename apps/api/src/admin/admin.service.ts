import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  auditLog,
  billingPayment,
  endOfDay,
  likePattern,
  membership,
  organization,
  parseDate,
  personalAccount,
  subscription,
  toPaged,
  user,
  type Db,
} from "@repo/db";
import { DB } from "../db/db.module";
import { badRequest, conflict, forbidden, notFound, validationFailed } from "../common/http";
import {
  AUTH_ENGINE,
  engineErrorCode,
  type AuthEngine,
  type RequestSession,
} from "../auth/auth-engine";
import { recordAudit, resolveActor } from "../organizations/audit";

/**
 * Super-admin flows (spec 6.1–6.3, 11.3) — the Nest twin of the web app's
 * `features/admin/actions.ts` + `data.ts`.
 *
 * Same rules, in the same order:
 * - `SuperAdminGuard` (not this service) is the boundary; every method below
 *   assumes it already ran — except `stopImpersonating`, which is reachable
 *   behind `SessionGuard` alone (the caller is the impersonated non-admin),
 *   and `seedSuperAdmin`, which is dev-only;
 * - reads are cross-tenant BY DESIGN (§6.2 carve-out): the guard replaces the
 *   owner filter as the isolation boundary, exactly as the web module's header
 *   documents;
 * - Rule A (our effect: delete-user, delete-org) writes the audit row in the
 *   SAME transaction as the effect; Rule B (engine effect: impersonate, stop,
 *   suspend, unsuspend, set-role) writes the audit row FIRST, then calls the
 *   engine — a shared transaction is impossible (the engine runs on its own
 *   connection), so the log records authorized intent and over-logs rather
 *   than under-logs (see the web `features/admin/audit.ts` header);
 * - `resolveActor` is awaited BEFORE any transaction opens (a query inside
 *   would take a second pooled connection while `tx` holds the first);
 *   `targetLabel` lookups that belong inside use `tx`, never `db`;
 * - a super admin is immune to panel actions until demoted (`TARGET_IS_ADMIN`);
 *   you cannot act on yourself (`CANNOT_ACT_ON_SELF`); the last super admin
 *   cannot be revoked (`LAST_ADMIN`, 409).
 *
 * Throws `HttpException`s with the OpenAPI envelope (`{ error }`). Codes are
 * neutral vocabulary, never vendor strings.
 */

export const ADMIN_PAGE_SIZE = 25;

export type UserStatus = "active" | "suspended" | "deleted";

/**
 * One meaning per column: `deletedAt` and `banned` are independent facts.
 * Deleted wins for display because it is terminal — and it is why unsuspend
 * must refuse a deleted account rather than appearing to resurrect it.
 */
function statusOf(row: { banned: boolean | null; deletedAt: Date | null }): UserStatus {
  if (row.deletedAt) return "deleted";
  if (row.banned) return "suspended";
  return "active";
}

/**
 * Read-side mirror of the engine's role derivation. Duplicates a rule the
 * engine owns because the engine derives from a SESSION (the current user),
 * and this is a list of OTHER people, for whom no session exists.
 */
function isSuperAdminRoleValue(role: string | null): boolean {
  return (role ?? "user").split(",").includes("superadmin");
}

/** Super admins are immune to panel actions until demoted. */
function assertNotSuperAdminTarget(target: { isSuperAdmin: boolean }): void {
  if (target.isSuperAdmin) forbidden("TARGET_IS_ADMIN");
}

/**
 * The actor for a panel mutation: ALWAYS `Admin`, never resolved.
 *
 * `resolveActor` (tenant flows) returns `User` for a plain session and
 * `Admin` only under impersonation — but the panel is the super-admin
 * surface itself, and `SuperAdminGuard` already proved the caller is one.
 * The web `actions.ts` hardcoded the same; the E2E suite asserts the
 * `Admin` actor type on `impersonation.start/stop` rows. (`stop` is the one
 * exception: its session IS impersonated, so it keeps `resolveActor`.)
 */
function adminActor(session: RequestSession): {
  actorType: "Admin";
  actorId: string;
  actorEmail: string;
} {
  return { actorType: "Admin", actorId: session.user.id, actorEmail: session.user.email };
}

const userListQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  status: z.enum(["all", "active", "suspended", "deleted"]).catch("all"),
  from: z.string().trim().catch(""),
  to: z.string().trim().catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

const orgListQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

const auditListQuerySchema = z.object({
  q: z.string().trim().max(200).catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

/** Server-side English backstops (spec 22.2): rules mirror the web schemas. */
const suspendBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * Impersonation requires a REASON (spec 6.4): `min(10)` because a mandatory
 * field that accepts "x" is theatre, and this action reads another person's
 * account. The reason lands in the audit entry's metadata, where the target's
 * org can see it.
 */
const impersonateBodySchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

const setSuperAdminBodySchema = z.object({
  value: z.enum(["grant", "revoke"]),
});

export interface RequestInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
  status: UserStatus;
  createdAt: Date;
}

export interface AdminUserDetail extends AdminUserRow {
  banReason: string | null;
  deletedAt: Date | null;
  orgs: { id: string; name: string; slug: string; role: string; status: string }[];
}

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  planId: string | null;
  subscriptionStatus: string | null;
  seats: number | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface AdminOrgDetail extends AdminOrgRow {
  members: { userId: string; email: string; name: string; role: string; status: string }[];
  /**
   * Net revenue to date, PER CURRENCY. Never summed across currencies: the
   * amounts are minor units in whatever the customer paid, and adding PLN to
   * USD without an FX rate produces a confident, meaningless number.
   */
  revenue: { currency: string; netMinor: number }[];
}

export interface AdminAuditRow {
  id: string;
  action: string;
  actorType: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH_ENGINE) private readonly engine: AuthEngine,
  ) {}

  // --- Users: reads ----------------------------------------------------------

  /**
   * All users, filtered (spec 6.2). Cross-tenant by design — see the module
   * header. `ILIKE '%…%'` is a sequential scan; past tens of thousands of
   * users add `pg_trgm` + a GIN index rather than a search service.
   */
  async listUsers(
    query: unknown,
  ): Promise<{ rows: AdminUserRow[]; page: number; hasNext: boolean }> {
    const q = userListQuerySchema.parse(query);
    const filters = [];

    if (q.q) {
      const pattern = likePattern(q.q);
      filters.push(or(ilike(user.email, pattern), ilike(user.name, pattern)));
    }
    if (q.status === "active") {
      filters.push(eq(user.banned, false), isNull(user.deletedAt));
    } else if (q.status === "suspended") {
      filters.push(eq(user.banned, true), isNull(user.deletedAt));
    } else if (q.status === "deleted") {
      filters.push(isNotNull(user.deletedAt));
    }

    const from = parseDate(q.from);
    if (from) filters.push(gte(user.createdAt, from));
    const to = parseDate(q.to);
    if (to) filters.push(lt(user.createdAt, endOfDay(to)));

    const rows = await this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        role: user.role,
        banned: user.banned,
        deletedAt: user.deletedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(user.createdAt))
      .limit(ADMIN_PAGE_SIZE + 1)
      .offset(q.page * ADMIN_PAGE_SIZE);

    const paged = toPaged(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        emailVerified: row.emailVerified,
        isSuperAdmin: isSuperAdminRoleValue(row.role),
        status: statusOf(row),
        createdAt: row.createdAt,
      })),
      q.page,
      ADMIN_PAGE_SIZE,
    );
    return { rows: paged.rows, page: paged.page, hasNext: paged.hasNext };
  }

  /** One user with their memberships (spec 6.2 — account detail view). */
  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        deletedAt: user.deletedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) notFound("USER_NOT_FOUND");

    const orgs = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
        status: membership.status,
      })
      .from(membership)
      .innerJoin(organization, eq(membership.organizationId, organization.id))
      .where(and(eq(membership.userId, userId), isNull(organization.deletedAt)))
      .orderBy(organization.name);

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      isSuperAdmin: isSuperAdminRoleValue(row.role),
      status: statusOf(row),
      createdAt: row.createdAt,
      banReason: row.banReason,
      deletedAt: row.deletedAt,
      orgs,
    };
  }

  /**
   * Organizations where `userId` is the ONLY active owner. Drives the cascade
   * disclosure when deleting a user (§3.2's "every org keeps at least one
   * owner"): exactly the orgs that would be left ownerless.
   */
  async listSolelyOwnedOrgs(userId: string): Promise<{ id: string; name: string; slug: string }[]> {
    const ownerCounts = this.db
      .select({
        organizationId: membership.organizationId,
        owners: count().as("owners"),
      })
      .from(membership)
      .where(and(eq(membership.role, "owner"), eq(membership.status, "active")))
      .groupBy(membership.organizationId)
      .as("owner_counts");

    const rows = await this.db
      .select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(membership)
      .innerJoin(organization, eq(membership.organizationId, organization.id))
      .innerJoin(ownerCounts, eq(ownerCounts.organizationId, organization.id))
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.role, "owner"),
          eq(membership.status, "active"),
          isNull(organization.deletedAt),
          eq(ownerCounts.owners, 1),
        ),
      )
      .orderBy(organization.name);

    return rows;
  }

  /** How many super admins exist — guards "you cannot revoke the last one". */
  async countSuperAdmins(): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(user)
      .where(and(eq(user.role, "superadmin"), isNull(user.deletedAt)));
    return row?.total ?? 0;
  }

  // --- Organizations: reads ----------------------------------------------------

  /**
   * All organizations with their §6.2 metrics.
   *
   * MRR ("jeśli dotyczy") is NOT here: plans carry no price amount and no
   * interval, and `subscription` stores a quantity but no unit price. Deriving
   * it from `billing_payment` is also wrong (an annual plan contributes 12× in
   * one month and 0× in eleven). Revenue-to-date (below) is the honest thing
   * shown today.
   */
  async listOrganizations(
    query: unknown,
  ): Promise<{ rows: AdminOrgRow[]; page: number; hasNext: boolean }> {
    const q = orgListQuerySchema.parse(query);
    const filters = [];
    if (q.q) {
      const pattern = likePattern(q.q);
      filters.push(or(ilike(organization.name, pattern), ilike(organization.slug, pattern)));
    }

    const rows = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
        deletedAt: organization.deletedAt,
        memberCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${membership}
          WHERE ${membership.organizationId} = ${organization.id}
            AND ${membership.status} = 'active'
        )`,
        // The org's current plan: the newest live subscription, or none → free.
        planId: sql<string | null>`(
          SELECT ${subscription.planId} FROM ${subscription}
          WHERE ${subscription.organizationId} = ${organization.id}
            AND ${subscription.status} IN ('active', 'trialing')
          ORDER BY ${subscription.lastEventAt} DESC LIMIT 1
        )`,
        subscriptionStatus: sql<string | null>`(
          SELECT ${subscription.status} FROM ${subscription}
          WHERE ${subscription.organizationId} = ${organization.id}
            AND ${subscription.status} IN ('active', 'trialing')
          ORDER BY ${subscription.lastEventAt} DESC LIMIT 1
        )`,
        seats: sql<number | null>`(
          SELECT ${subscription.quantity} FROM ${subscription}
          WHERE ${subscription.organizationId} = ${organization.id}
            AND ${subscription.status} IN ('active', 'trialing')
          ORDER BY ${subscription.lastEventAt} DESC LIMIT 1
        )`,
      })
      .from(organization)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(organization.createdAt))
      .limit(ADMIN_PAGE_SIZE + 1)
      .offset(q.page * ADMIN_PAGE_SIZE);

    const paged = toPaged(rows, q.page, ADMIN_PAGE_SIZE);
    return { rows: paged.rows, page: paged.page, hasNext: paged.hasNext };
  }

  /** One organization with members and revenue (spec 6.2 — org detail view). */
  async getOrganizationDetail(orgId: string): Promise<AdminOrgDetail> {
    const summary = await this.orgSummaryById(orgId);
    if (!summary) notFound("ORGANIZATION_NOT_FOUND");

    const [members, revenue] = await Promise.all([
      this.db
        .select({
          userId: user.id,
          email: user.email,
          name: user.name,
          role: membership.role,
          status: membership.status,
        })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .where(eq(membership.organizationId, orgId))
        .orderBy(desc(membership.createdAt)),
      this.db
        .select({
          currency: billingPayment.currency,
          // Refunds subtract; anything else (failed) contributes nothing.
          netMinor: sql<number>`COALESCE(SUM(
            CASE
              WHEN ${billingPayment.status} = 'paid' THEN ${billingPayment.amount}
              WHEN ${billingPayment.status} = 'refunded' THEN -${billingPayment.amount}
              ELSE 0
            END
          ), 0)::int`,
        })
        .from(billingPayment)
        .where(
          and(
            eq(billingPayment.organizationId, orgId),
            inArray(billingPayment.status, ["paid", "refunded"]),
          ),
        )
        .groupBy(billingPayment.currency),
    ]);

    return { ...summary, members, revenue };
  }

  /**
   * One org's summary metrics by id. Unlike the list query this one does NOT
   * filter out soft-deleted orgs: the panel must still open a deleted org's
   * detail page during the retention window.
   */
  private async orgSummaryById(orgId: string): Promise<AdminOrgRow | null> {
    const [row] = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
        deletedAt: organization.deletedAt,
      })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    if (!row) return null;

    const [memberRow] = await this.db
      .select({ total: count() })
      .from(membership)
      .where(and(eq(membership.organizationId, orgId), eq(membership.status, "active")));

    const [sub] = await this.db
      .select({
        planId: subscription.planId,
        status: subscription.status,
        quantity: subscription.quantity,
      })
      .from(subscription)
      .where(
        and(
          eq(subscription.organizationId, orgId),
          inArray(subscription.status, ["active", "trialing"]),
        ),
      )
      .orderBy(desc(subscription.lastEventAt))
      .limit(1);

    return {
      ...row,
      memberCount: memberRow?.total ?? 0,
      planId: sub?.planId ?? null,
      subscriptionStatus: sub?.status ?? null,
      seats: sub?.quantity ?? null,
    };
  }

  // --- Audit: reads ------------------------------------------------------------

  /**
   * Audit entries, newest first (spec 6.3). `q` filtering is a hard
   * requirement: the E2E suite shares one database across parallel workers,
   * and this list is global by design, so an unfiltered assertion is a flake.
   */
  async listAuditEntries(
    query: unknown,
  ): Promise<{ rows: AdminAuditRow[]; page: number; hasNext: boolean }> {
    const q = auditListQuerySchema.parse(query);
    const filters = [];
    if (q.q) {
      const pattern = likePattern(q.q);
      filters.push(
        or(
          ilike(auditLog.actorEmail, pattern),
          ilike(auditLog.targetLabel, pattern),
          ilike(auditLog.action, pattern),
        ),
      );
    }

    const rows = await this.db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorType: auditLog.actorType,
        actorEmail: auditLog.actorEmail,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        targetLabel: auditLog.targetLabel,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(ADMIN_PAGE_SIZE + 1)
      .offset(q.page * ADMIN_PAGE_SIZE);

    const paged = toPaged(rows, q.page, ADMIN_PAGE_SIZE);
    return { rows: paged.rows, page: paged.page, hasNext: paged.hasNext };
  }

  // --- Mutations -----------------------------------------------------------------

  private engineFailure(): never {
    throw new HttpException({ error: "UNKNOWN" }, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /**
   * Impersonate a user (spec 6.2). Audit-first — Rule B: the effect swaps the
   * session cookie, so auditing afterwards would leave a window with a swapped
   * cookie and no row. Returns the `Set-Cookie` values for the controller to
   * relay (the `nextCookies` replacement).
   */
  async impersonate(
    session: RequestSession,
    headers: Headers,
    targetId: string,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ body: { ok: true }; setCookies: string[] }> {
    const parsed = impersonateBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const target = await this.getUserDetail(targetId);
    if (target.status === "deleted") badRequest("ALREADY_DELETED");
    if (target.isSuperAdmin) forbidden("IMPERSONATION_FORBIDDEN");

    // The actor is the admin, hardcoded BEFORE the audit write (never inside
    // a transaction — and this flow holds none, Rule B writes with plain `db`).
    const actor = adminActor(session);
    await recordAudit(
      this.db,
      {
        action: "impersonation.start",
        actor,
        organizationId: null,
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
        metadata: { reason: parsed.data.reason },
      },
      req,
    );

    try {
      const result = await this.engine.api.impersonateUser({
        headers,
        body: { userId: target.id },
        returnHeaders: true,
      });
      return { body: { ok: true }, setCookies: result.headers.getSetCookie() };
    } catch (error) {
      const code = engineErrorCode(error);
      if (
        code === "YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS" ||
        code === "YOU_CANNOT_IMPERSONATE_ADMINS" ||
        code === "YOU_ARE_NOT_ALLOWED_TO_BAN_USERS"
      ) {
        throw new HttpException({ error: "IMPERSONATION_FORBIDDEN" }, HttpStatus.FORBIDDEN);
      }
      if (code === "USER_NOT_FOUND") notFound("USER_NOT_FOUND");
      this.engineFailure();
    }
  }

  /**
   * Leave admin mode (spec 6.2). Deliberately NOT guarded by `SuperAdminGuard`:
   * the caller is the impersonated (non-admin) user, so that guard would 403
   * exactly the person who needs to get out. The session's own
   * `impersonatedBy` is the authorization.
   *
   * Everything the audit entry needs is resolved BEFORE the swap, and the entry
   * is written before it too (Rule B): the actor is the admin who started this,
   * and the only record of who that is lives on the session about to be
   * destroyed. After the swap there is NO session read (stale-cookie).
   */
  async stopImpersonating(
    session: RequestSession,
    headers: Headers,
    req: RequestInfo,
  ): Promise<{ body: { ok: true; signedOut: boolean }; setCookies: string[] }> {
    if (session.impersonatedBy === null) badRequest("NOT_IMPERSONATING");

    // resolveActor, NOT adminActor: this session IS impersonated, so the actor
    // is the admin in `impersonatedBy` (looked up for the email) — attributing
    // to `session.user` here would name the victim as the actor.
    const actor = await resolveActor(this.db, session);
    await recordAudit(
      this.db,
      {
        action: "impersonation.stop",
        actor,
        organizationId: null,
        targetType: "user",
        targetId: session.user.id,
        targetLabel: session.user.email,
      },
      req,
    );

    try {
      const result = await this.engine.api.stopImpersonating({ headers, returnHeaders: true });
      return { body: { ok: true, signedOut: false }, setCookies: result.headers.getSetCookie() };
    } catch {
      // The engine 500s when the ADMIN'S OWN session expired during the
      // impersonation — it has no session left to restore. Signing out is
      // always safe and always available; without this fallback the admin
      // stays trapped inside someone else's account.
      const result = await this.engine.api.signOut({ headers, returnHeaders: true });
      return { body: { ok: true, signedOut: true }, setCookies: result.headers.getSetCookie() };
    }
  }

  /** Suspend an account (spec 6.2). Audit-first — Rule B. */
  async suspend(
    session: RequestSession,
    headers: Headers,
    targetId: string,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ ok: true }> {
    const parsed = suspendBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    if (targetId === session.user.id) forbidden("CANNOT_ACT_ON_SELF");

    const target = await this.getUserDetail(targetId);
    assertNotSuperAdminTarget(target);
    if (target.status === "deleted") badRequest("ALREADY_DELETED");

    const actor = adminActor(session);
    await recordAudit(
      this.db,
      {
        action: "user.suspend",
        actor,
        organizationId: null,
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
        metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
      },
      req,
    );

    try {
      await this.engine.api.banUser({
        headers,
        body: {
          userId: target.id,
          ...(parsed.data.reason ? { banReason: parsed.data.reason } : {}),
        },
      });
    } catch {
      this.engineFailure();
    }
    return { ok: true };
  }

  /** Lift a suspension (spec 6.2). Audit-first — Rule B. */
  async unsuspend(
    session: RequestSession,
    headers: Headers,
    targetId: string,
    req: RequestInfo,
  ): Promise<{ ok: true }> {
    const target = await this.getUserDetail(targetId);
    // Deleted is terminal: un-suspending must never look like a way to
    // resurrect an account. `banned` and `deletedAt` stay separate facts.
    if (target.status === "deleted") badRequest("ALREADY_DELETED");

    const actor = adminActor(session);
    await recordAudit(
      this.db,
      {
        action: "user.unsuspend",
        actor,
        organizationId: null,
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
      },
      req,
    );

    try {
      await this.engine.api.unbanUser({ headers, body: { userId: target.id } });
    } catch {
      this.engineFailure();
    }
    return { ok: true };
  }

  /**
   * Soft-delete an account (spec 6.2 + 11.3). Our own effect — Rule A: the
   * audit row commits in the SAME transaction as the deletion.
   *
   * Cascades the user's solely-owned organizations. Refusing instead would make
   * a user undeletable because they once created an org (breaking GDPR
   * erasure); leaving those orgs behind would strand them with no owner,
   * violating the §3.2 invariant. Orgs with other owners are untouched.
   */
  async deleteUser(
    session: RequestSession,
    headers: Headers,
    targetId: string,
    req: RequestInfo,
  ): Promise<{ ok: true }> {
    if (targetId === session.user.id) forbidden("CANNOT_ACT_ON_SELF");

    const target = await this.getUserDetail(targetId);
    assertNotSuperAdminTarget(target);
    if (target.status === "deleted") badRequest("ALREADY_DELETED");

    const cascaded = await this.listSolelyOwnedOrgs(target.id);
    const actor = adminActor(session);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.update(user).set({ deletedAt: now }).where(eq(user.id, target.id));
      await tx
        .update(personalAccount)
        .set({ deletedAt: now })
        .where(eq(personalAccount.userId, target.id));

      for (const org of cascaded) {
        await tx.update(organization).set({ deletedAt: now }).where(eq(organization.id, org.id));
        await recordAudit(
          tx,
          {
            action: "organization.delete",
            actor,
            organizationId: org.id,
            targetType: "organization",
            targetId: org.id,
            targetLabel: org.slug,
            metadata: { cascadedFrom: target.id, cascadedFromEmail: target.email },
          },
          req,
        );
      }

      await tx.delete(membership).where(eq(membership.userId, target.id));

      await recordAudit(
        tx,
        {
          action: "user.delete",
          actor,
          organizationId: null,
          targetType: "user",
          targetId: target.id,
          targetLabel: target.email,
          metadata: cascaded.length > 0 ? { cascadedOrgs: cascaded.map((o) => o.slug) } : undefined,
        },
        req,
      );
    });

    // Hygiene only, deliberately AFTER the commit and deliberately unchecked:
    // `getSession` already returns null for a deleted user, so their live
    // sessions die on their next request whether or not this succeeds.
    try {
      await this.engine.api.revokeUserSessions({ headers, body: { userId: target.id } });
    } catch {
      // Best-effort by design (see above).
    }

    return { ok: true };
  }

  /** Soft-delete an organization (spec 6.2 + 11.3). Our own effect — Rule A. */
  async deleteOrganization(
    session: RequestSession,
    orgId: string,
    req: RequestInfo,
  ): Promise<{ ok: true }> {
    const [org] = await this.db
      .select({ id: organization.id, slug: organization.slug, deletedAt: organization.deletedAt })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);

    if (!org) notFound("ORGANIZATION_NOT_FOUND");
    if (org.deletedAt) badRequest("ALREADY_DELETED");

    const actor = adminActor(session);
    await this.db.transaction(async (tx) => {
      await tx
        .update(organization)
        .set({ deletedAt: new Date() })
        .where(eq(organization.id, org.id));
      await recordAudit(
        tx,
        {
          action: "organization.delete",
          actor,
          organizationId: org.id,
          targetType: "organization",
          targetId: org.id,
          targetLabel: org.slug,
        },
        req,
      );
    });

    return { ok: true };
  }

  /**
   * Grant or revoke the system-level super-admin flag (spec 6.1).
   * Audit-first — Rule B. The highest-privilege action in the system, and the
   * strongest case for the audit log — it is what makes §6.3's "role change"
   * real for the SYSTEM role.
   */
  async setSuperAdmin(
    session: RequestSession,
    headers: Headers,
    targetId: string,
    body: unknown,
    req: RequestInfo,
  ): Promise<{ ok: true }> {
    const parsed = setSuperAdminBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);

    const grant = parsed.data.value === "grant";

    if (!grant && targetId === session.user.id) forbidden("CANNOT_ACT_ON_SELF");

    const target = await this.getUserDetail(targetId);
    if (target.status === "deleted") badRequest("ALREADY_DELETED");
    if (grant && target.isSuperAdmin) badRequest("ALREADY_ADMIN");
    if (!grant && !target.isSuperAdmin) badRequest("NOT_ADMIN");

    if (!grant) {
      // Pre-read, not a FOR UPDATE lock. A lock held across the engine call is
      // the pattern Rule B rejects (two connections, one small pool), and the
      // race it would close — two admins revoking the last two super admins in
      // the same instant — is a once-a-year human action with a SQL-level
      // recovery. Never copy `lockActiveOwnerCount` here.
      if ((await this.countSuperAdmins()) <= 1) conflict("LAST_ADMIN");
    }

    const actor = adminActor(session);
    await recordAudit(
      this.db,
      {
        action: grant ? "superadmin.grant" : "superadmin.revoke",
        actor,
        organizationId: null,
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
      },
      req,
    );

    try {
      await this.engine.api.setRole({
        headers,
        body: { userId: target.id, role: grant ? "superadmin" : "user" },
      });
    } catch {
      this.engineFailure();
    }
    return { ok: true };
  }

  // --- Dev seam ------------------------------------------------------------------

  /**
   * Test-only super-admin promoter (spec 14.1). Grants the system-level flag
   * to an existing seeded user. Writes the role column directly rather than
   * going through `setSuperAdmin`, because that requires an existing super
   * admin — bootstrapping is exactly the case it cannot serve. Same operation
   * as the documented production SQL; there is deliberately NO in-app
   * bootstrap path.
   */
  async seedSuperAdmin(email: string): Promise<{ ok: true; userId: string }> {
    const updated = await this.db
      .update(user)
      // Must match the engine's SUPER_ADMIN_ROLE exactly — its
      // target-is-admin check is case-sensitive.
      .set({ role: "superadmin" })
      .where(eq(user.email, email))
      .returning({ id: user.id });

    if (updated.length === 0) {
      throw new HttpException({ error: `user ${email} not found` }, HttpStatus.BAD_REQUEST);
    }
    return { ok: true, userId: updated[0]!.id };
  }
}
