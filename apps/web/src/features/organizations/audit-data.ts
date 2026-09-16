import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { endOfDay, likePattern, parseDate, toPaged, type Paged } from "@/lib/db/pagination";
import { auditLog } from "@/lib/db/schema";
import type { ActorType, AuditAction } from "@/features/admin/audit";
import { AUDIT_PAGE_SIZE, type OrgAuditListQuery } from "./schema";

/**
 * Tenant-scoped audit trail reader (spec 6.4).
 *
 * The counterpart to `features/admin/data.ts`'s `listAuditEntries`, and the reason
 * the two are separate modules rather than one function with a nullable filter:
 * they have OPPOSITE boundaries. That one reads across every tenant and is safe
 * only behind `requireSuperAdmin()`, which is why `no-restricted-imports` fences
 * it to `features/admin/**`. This one reads exactly one tenant and is safe behind
 * `requireOrgPermission(slug, "audit.read")`.
 *
 * A single shared function taking `organizationId: string | null` would have been
 * the obvious de-duplication and is precisely the wrong shape: `null` would mean
 * "every tenant", so one forgotten argument at one call site silently becomes a
 * cross-tenant read. Here `organizationId` is a REQUIRED, non-nullable parameter —
 * there is no way to call this function without naming a tenant, and that is the
 * isolation guarantee (§11.2), enforced by the compiler rather than by review.
 *
 * NOTE the table it reads is the one place in the schema where the owner column is
 * nullable (see `schema/audit-logs.ts`). Rows with `organizationId IS NULL` are
 * system events belonging to no tenant; the `eq()` below excludes them from every
 * tenant read automatically, which is the behaviour we want — an org must not see
 * a super-admin's system-role grant.
 */

export type OrgAuditRow = {
  id: string;
  action: AuditAction;
  actorType: ActorType;
  actorEmail: string;
  targetType: string;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export async function listOrgAuditEntries(
  organizationId: string,
  query: OrgAuditListQuery,
): Promise<Paged<OrgAuditRow>> {
  // The owner filter leads and is never conditional. Everything appended to
  // `filters` below is a user-supplied narrowing; this one is the boundary.
  const filters: SQL[] = [eq(auditLog.organizationId, organizationId)];

  if (query.q) {
    const pattern = likePattern(query.q);
    const match = or(
      ilike(auditLog.actorEmail, pattern),
      ilike(auditLog.targetLabel, pattern),
      ilike(auditLog.action, pattern),
    );
    if (match) filters.push(match);
  }

  const from = parseDate(query.from);
  if (from) filters.push(gte(auditLog.createdAt, from));
  const to = parseDate(query.to);
  if (to) filters.push(lte(auditLog.createdAt, endOfDay(to)));

  const rows = await db
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
    .offset(query.page * AUDIT_PAGE_SIZE);

  // `action`/`actorType` are `text` in the DB and typed unions in the app. The
  // cast is honest rather than lazy: the column is append-only and written only
  // by `recordAudit`, whose parameter types are those unions, so the DB cannot
  // hold a value outside them. The page renders unknown values as raw strings
  // anyway (see the i18n fallback), so a stale row from an older deploy degrades
  // to its literal action name rather than throwing.
  return toPaged(
    rows.map((row) => ({
      ...row,
      action: row.action as AuditAction,
      actorType: row.actorType as ActorType,
    })),
    query.page,
    AUDIT_PAGE_SIZE,
  );
}
