import { and, asc, eq, gte, lt } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { classSession } from "@/lib/db/schema";

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
