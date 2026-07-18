import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { endOfDay, likePattern, parseDate, toPaged, type Paged } from "@/lib/db/pagination";
import {
  auditLog,
  billingPayment,
  membership,
  organization,
  subscription,
  user,
} from "@/lib/db/schema";
import { PAGE_SIZE, type AuditListQuery, type OrgListQuery, type UserListQuery } from "./schema";

/**
 * Admin data-access layer (spec 6.2 — global user/organization views).
 *
 * TENANT-ISOLATION CARVE-OUT (spec 1.3 / 11.2) — the SECOND documented exception,
 * alongside the identity tables in `src/lib/db/schema/auth.ts`.
 *
 * Every other feature's data layer scopes each query by `organizationId`/
 * `accountId` (reference: `src/features/organizations/data.ts`, whose rule is
 * "never query a tenant table without its owner filter"). This module
 * deliberately does NOT: §6.2 requires a view of ALL users and ALL organizations,
 * so reading across tenants is the entire point of the module, not an oversight.
 *
 * WHAT REPLACES THE OWNER FILTER AS THE BOUNDARY: every exported function here is
 * only ever reachable behind `requireSuperAdmin()` (`./context.ts`), which every
 * caller — page and action alike — invokes as its FIRST line. That guard is the
 * isolation boundary for this module, exactly as the owner column is for the others.
 *
 * DO NOT import this module outside `src/features/admin/**`. Nothing else applies
 * the guard, and a cross-tenant query behind an unguarded caller is a tenant
 * isolation breach, not a bug. Enforced by `no-restricted-imports` in
 * eslint.config.mjs — the rule is the enforcement, this paragraph is only the why.
 */

export type { Paged };

export type UserStatus = "active" | "suspended" | "deleted";

/**
 * One meaning per column: `deletedAt` and `banned` are independent facts, never
 * overloaded onto each other. Deleted wins for display because it is terminal —
 * and it is why `unsuspendUser` must refuse a deleted account rather than
 * appearing to resurrect it.
 */
function statusOf(row: { banned: boolean | null; deletedAt: Date | null }): UserStatus {
  if (row.deletedAt) return "deleted";
  if (row.banned) return "suspended";
  return "active";
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
  status: UserStatus;
  createdAt: Date;
};

/**
 * All users, filtered (spec 6.2). Cross-tenant by design — see the header.
 *
 * `ILIKE '%…%'` is a sequential scan. Fine into the tens of thousands of users;
 * past that add `CREATE EXTENSION pg_trgm` + a GIN index in a custom SQL
 * migration rather than reaching for a search service.
 */
export async function listAllUsers(query: UserListQuery): Promise<Paged<AdminUserRow>> {
  const filters = [];

  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(or(ilike(user.email, pattern), ilike(user.name, pattern)));
  }
  if (query.status === "active") {
    filters.push(eq(user.banned, false), isNull(user.deletedAt));
  } else if (query.status === "suspended") {
    filters.push(eq(user.banned, true), isNull(user.deletedAt));
  } else if (query.status === "deleted") {
    filters.push(isNotNull(user.deletedAt));
  }

  const from = parseDate(query.from);
  if (from) filters.push(gte(user.createdAt, from));
  const to = parseDate(query.to);
  if (to) filters.push(lt(user.createdAt, endOfDay(to)));

  const rows = await db
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
    .limit(PAGE_SIZE + 1)
    .offset(query.page * PAGE_SIZE);

  return toPaged(
    rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      isSuperAdmin: isSuperAdminRoleValue(row.role),
      status: statusOf(row),
      createdAt: row.createdAt,
    })),
    query.page,
    PAGE_SIZE,
  );
}

/**
 * Read-side mirror of the adapter's role derivation.
 *
 * Yes, this duplicates a rule the adapter owns — but the alternative is worse:
 * the adapter derives from a SESSION (the current user), and this is a list of
 * other people, for whom no session exists. The value is one string comparison
 * against one column; the coupling is contained to this one function.
 */
function isSuperAdminRoleValue(role: string | null): boolean {
  return (role ?? "user").split(",").includes("superadmin");
}

export type AdminUserDetail = AdminUserRow & {
  banReason: string | null;
  deletedAt: Date | null;
  orgs: { id: string; name: string; slug: string; role: string; status: string }[];
};

/** One user with their memberships (spec 6.2 — account detail view). */
export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const [row] = await db
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

  if (!row) return null;

  const orgs = await db
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
 * Organizations where `userId` is the ONLY active owner.
 *
 * Drives the cascade disclosure when deleting a user (spec 6.2 + §3.2's
 * "every org keeps at least one owner"): these are exactly the orgs that would be
 * left ownerless, so they are the ones the confirm dialog must name.
 */
export async function listSolelyOwnedOrgs(
  userId: string,
): Promise<{ id: string; name: string; slug: string }[]> {
  const ownerCounts = db
    .select({
      organizationId: membership.organizationId,
      owners: count().as("owners"),
    })
    .from(membership)
    .where(and(eq(membership.role, "owner"), eq(membership.status, "active")))
    .groupBy(membership.organizationId)
    .as("owner_counts");

  const rows = await db
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

/**
 * One user's email, or null. A deliberately narrow lookup for audit attribution,
 * where `getUserDetail`'s membership join would be pure waste.
 */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/** How many super admins exist — guards "you cannot revoke the last one". */
export async function countSuperAdmins(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(user)
    .where(and(eq(user.role, "superadmin"), isNull(user.deletedAt)));
  return row?.total ?? 0;
}

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  planId: string | null;
  subscriptionStatus: string | null;
  seats: number | null;
  createdAt: Date;
  deletedAt: Date | null;
};

/**
 * All organizations with their §6.2 metrics.
 *
 * MRR ("jeśli dotyczy" — if applicable) is NOT here, because it is not computable
 * yet: `features/billing/plans.ts` deliberately carries no price amount and no
 * interval (those arrive with §5.2's pricing table), and `subscription` stores a
 * quantity but no unit price. Once plans carry `amountMinor` + `interval`:
 *
 *   MRR = Σ over active|trialing subs of amount × quantity × (interval === "year" ? 1/12 : 1)
 *
 * Do NOT add prices here to unblock it — that would fork pricing truth away from
 * §5.2 and put it out of sync with the provider. Deriving it from billing_payment
 * is also wrong, however tempting: an annual plan contributes 12× in one month and
 * 0× in the other eleven, so the number would be a lie for exactly the customers
 * who matter most. Revenue-to-date (below) is the honest thing we can show today.
 */
export async function listAllOrganizations(query: OrgListQuery): Promise<Paged<AdminOrgRow>> {
  const filters = [];
  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(or(ilike(organization.name, pattern), ilike(organization.slug, pattern)));
  }

  const rows = await db
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
    .limit(PAGE_SIZE + 1)
    .offset(query.page * PAGE_SIZE);

  return toPaged(rows, query.page, PAGE_SIZE);
}

export type RevenueByCurrency = { currency: string; netMinor: number };

export type AdminOrgDetail = AdminOrgRow & {
  members: { userId: string; email: string; name: string; role: string; status: string }[];
  /**
   * Net revenue to date, PER CURRENCY. Never summed across currencies: the
   * amounts are minor units in whatever the customer paid, and adding PLN to USD
   * without an FX rate produces a confident, meaningless number.
   */
  revenue: RevenueByCurrency[];
};

/** One organization with members and revenue (spec 6.2 — org detail view). */
export async function getOrganizationDetail(orgId: string): Promise<AdminOrgDetail | null> {
  const summary = await orgSummaryById(orgId);
  if (!summary) return null;

  const [members, revenue] = await Promise.all([
    db
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
    db
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
 * One org's summary metrics by id — the same shape `listAllOrganizations` builds
 * per row, but fetched directly. Unlike the list query this one does NOT filter
 * out soft-deleted orgs: the panel must still be able to open a deleted org's
 * detail page during the retention window.
 */
async function orgSummaryById(orgId: string): Promise<AdminOrgRow | null> {
  const [row] = await db
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

  const [memberRow] = await db
    .select({ total: count() })
    .from(membership)
    .where(and(eq(membership.organizationId, orgId), eq(membership.status, "active")));

  const [sub] = await db
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

export type AuditRow = {
  id: string;
  action: string;
  /** §6.4 actor model: User | System | AIAgent | Admin. */
  actorType: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

/**
 * Audit entries, newest first (spec 6.3).
 *
 * `?q=` filtering is a hard requirement, not a nicety: the E2E suite shares one
 * database across parallel workers, and this list is global by design, so an
 * assertion that does not filter by a unique email is a flake waiting for the
 * suite to grow.
 */
export async function listAuditEntries(query: AuditListQuery): Promise<Paged<AuditRow>> {
  const filters = [];
  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(
      or(
        ilike(auditLog.actorEmail, pattern),
        ilike(auditLog.targetLabel, pattern),
        ilike(auditLog.action, pattern),
      ),
    );
  }

  const rows = await db
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
    .limit(PAGE_SIZE + 1)
    .offset(query.page * PAGE_SIZE);

  return toPaged(rows, query.page, PAGE_SIZE);
}
