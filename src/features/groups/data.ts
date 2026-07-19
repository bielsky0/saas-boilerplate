import { and, eq, isNull } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { groupType, groupTypeRecurrence } from "@/lib/db/schema";

/**
 * Group type + recurrence data access (langlion §1.2, EPIK 2).
 *
 * Same two conventions as `features/locations/data.ts`: a `TenantDb` handle
 * rather than `db`, and an explicit `organizationId` filter that RLS then backs
 * up. See that module's header for why the redundancy is deliberate.
 */

/** Active group types for an academy. */
export async function listGroupTypes(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(groupType)
    .where(and(eq(groupType.organizationId, organizationId), isNull(groupType.deletedAt)))
    .orderBy(groupType.name);
}

/** One active group type by id, or null. */
export async function getGroupType(tx: TenantDb, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(groupType)
    .where(
      and(
        eq(groupType.id, id),
        eq(groupType.organizationId, organizationId),
        isNull(groupType.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * One active group type by its public slug, or null.
 *
 * The slug is unique per organization, not globally (decyzja D10), so the tenant
 * is part of the lookup key rather than a filter applied afterwards — two
 * academies may both publish `obozy-2026`.
 */
export async function getGroupTypeBySlug(tx: TenantDb, organizationId: string, slug: string) {
  const [row] = await tx
    .select()
    .from(groupType)
    .where(
      and(
        eq(groupType.slug, slug),
        eq(groupType.organizationId, organizationId),
        isNull(groupType.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Active recurrence patterns under one group type (US-2.3 — several run in parallel). */
export async function listRecurrences(tx: TenantDb, organizationId: string, groupTypeId: string) {
  return tx
    .select()
    .from(groupTypeRecurrence)
    .where(
      and(
        eq(groupTypeRecurrence.organizationId, organizationId),
        eq(groupTypeRecurrence.groupTypeId, groupTypeId),
        isNull(groupTypeRecurrence.deletedAt),
      ),
    )
    .orderBy(groupTypeRecurrence.dayOfWeek, groupTypeRecurrence.startTime);
}
