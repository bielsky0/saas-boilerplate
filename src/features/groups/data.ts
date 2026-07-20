import { and, eq, isNull, sql } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { classSession, groupType, groupTypeRecurrence, location, user } from "@/lib/db/schema";

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

/**
 * Patterns under one group type, with the names and season progress the
 * management page renders.
 *
 * `generatedCount` counts FUTURE, non-cancelled sessions — the number that
 * answers "is this pattern actually producing a season?". Deliberately not a
 * lifetime total: a pattern that ran all last season and generates nothing now
 * would otherwise look healthy at a glance, which is the confusion the column
 * exists to prevent.
 *
 * Joined rather than looked up per row, for the reason spelled out in
 * `features/schedule/data.ts`: one row per pattern, otherwise an N+1 inside a
 * single pooled connection.
 */
export async function listRecurrencesWithDetails(
  tx: TenantDb,
  organizationId: string,
  groupTypeId: string,
  now: Date = new Date(),
) {
  return tx
    .select({
      id: groupTypeRecurrence.id,
      dayOfWeek: groupTypeRecurrence.dayOfWeek,
      startTime: groupTypeRecurrence.startTime,
      durationMinutes: groupTypeRecurrence.durationMinutes,
      capacity: groupTypeRecurrence.capacity,
      isRecurring: groupTypeRecurrence.isRecurring,
      occurrencesCount: groupTypeRecurrence.occurrencesCount,
      startDate: groupTypeRecurrence.startDate,
      trainerId: groupTypeRecurrence.trainerId,
      trainerName: user.name,
      trainerEmail: user.email,
      locationId: groupTypeRecurrence.locationId,
      locationName: location.name,
      generatedCount: sql<number>`(
        select count(*) from ${classSession}
        where ${classSession.generatedFromRecurrenceId} = ${groupTypeRecurrence.id}
          and ${classSession.organizationId} = ${organizationId}
          and ${classSession.status} = 'scheduled'
          and ${classSession.startTime} >= ${now.toISOString()}::timestamptz
      )`.as("generatedCount"),
    })
    .from(groupTypeRecurrence)
    .leftJoin(user, eq(user.id, groupTypeRecurrence.trainerId))
    .leftJoin(
      location,
      and(
        eq(location.id, groupTypeRecurrence.locationId),
        eq(location.organizationId, groupTypeRecurrence.organizationId),
      ),
    )
    .where(
      and(
        eq(groupTypeRecurrence.organizationId, organizationId),
        eq(groupTypeRecurrence.groupTypeId, groupTypeId),
        isNull(groupTypeRecurrence.deletedAt),
      ),
    )
    .orderBy(groupTypeRecurrence.dayOfWeek, groupTypeRecurrence.startTime);
}
