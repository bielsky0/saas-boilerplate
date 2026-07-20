import { and, asc, eq, gte, lt } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { classSession, groupType, location, user } from "@/lib/db/schema";

/**
 * Class session data access (langlion §1.2, §2.2).
 *
 * The table is `class_session`, not `session` — Better Auth owns that name; see
 * `schema/class-sessions.ts`. Every langlion reference to "session" means this.
 *
 * Same two conventions as `features/locations/data.ts`: a `TenantDb` handle, and
 * an explicit `organizationId` filter that RLS backs up rather than replaces.
 *
 * Note there is no soft-delete filter here. Sessions are not soft-deleted; they
 * are CANCELLED (`status`), which is a domain state with consequences —
 * compensating credits for paid bookings (§14.1), and a freed trainer slot,
 * since the exclusion constraint skips cancelled rows (decyzja D5).
 */

/** Sessions in a half-open window, ordered by start. Callers pass UTC instants. */
export async function listSessionsBetween(
  tx: TenantDb,
  organizationId: string,
  from: Date,
  to: Date,
) {
  return tx
    .select()
    .from(classSession)
    .where(
      and(
        eq(classSession.organizationId, organizationId),
        gte(classSession.startTime, from),
        lt(classSession.startTime, to),
      ),
    )
    .orderBy(asc(classSession.startTime));
}

/**
 * The staff schedule: upcoming sessions with the names an admin needs to read
 * them, optionally narrowed to one location (§2.12, US-22.5).
 *
 * JOINED, not fetched per row. The list renders a group type, a trainer and a
 * location for every session, and resolving those separately would be an N+1 —
 * on a season of 40 sessions, 121 queries inside one RLS transaction holding one
 * pooled connection.
 *
 * `leftJoin` for trainer and location because both are genuinely optional: a
 * Slot-First session has no trainer at definition time (US-2.1/AC3), and a
 * location can be absent when neither the pattern nor the group type set one.
 * An inner join would silently drop exactly the rows an admin most needs to
 * notice.
 */
export async function listUpcomingSessions(
  tx: TenantDb,
  organizationId: string,
  options: { from?: Date; locationId?: string; limit?: number } = {},
) {
  const from = options.from ?? new Date();
  const filters = [
    eq(classSession.organizationId, organizationId),
    gte(classSession.startTime, from),
  ];
  if (options.locationId) filters.push(eq(classSession.locationId, options.locationId));

  return tx
    .select({
      id: classSession.id,
      startTime: classSession.startTime,
      endTime: classSession.endTime,
      capacity: classSession.capacity,
      status: classSession.status,
      isManuallyAdjusted: classSession.isManuallyAdjusted,
      groupTypeId: classSession.groupTypeId,
      groupTypeName: groupType.name,
      trainerName: user.name,
      trainerEmail: user.email,
      locationId: classSession.locationId,
      locationName: location.name,
    })
    .from(classSession)
    .innerJoin(
      groupType,
      and(
        eq(groupType.id, classSession.groupTypeId),
        eq(groupType.organizationId, classSession.organizationId),
      ),
    )
    .leftJoin(user, eq(user.id, classSession.trainerId))
    .leftJoin(
      location,
      and(
        eq(location.id, classSession.locationId),
        eq(location.organizationId, classSession.organizationId),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(classSession.startTime))
    .limit(options.limit ?? 200);
}

/** One session by id, or null. Includes cancelled ones — the caller decides. */
export async function getSession(tx: TenantDb, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(classSession)
    .where(and(eq(classSession.id, id), eq(classSession.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/**
 * Future, non-cancelled sessions generated from one pattern.
 *
 * The shape most editing flows need: "what does changing this pattern affect?"
 * (§3.4) and "what blocks deactivating this trainer or group type?" (§2.11) are
 * both this query. History is excluded because neither operation may touch it.
 */
export async function listFutureSessionsForRecurrence(
  tx: TenantDb,
  organizationId: string,
  recurrenceId: string,
  now: Date = new Date(),
) {
  return tx
    .select()
    .from(classSession)
    .where(
      and(
        eq(classSession.organizationId, organizationId),
        eq(classSession.generatedFromRecurrenceId, recurrenceId),
        eq(classSession.status, "scheduled"),
        gte(classSession.startTime, now),
      ),
    )
    .orderBy(asc(classSession.startTime));
}
