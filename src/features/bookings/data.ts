import { and, eq, ne } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { booking } from "@/lib/db/schema";

/**
 * Booking data access (langlion §1.2, §2.3, §5.2).
 *
 * Same two conventions as `features/locations/data.ts`: a `TenantDb` handle, and
 * an explicit `organizationId` filter that RLS backs up rather than replaces.
 *
 * WHAT IS NOT HERE YET. The seat-taking transaction of §5.2 — `SELECT … FOR
 * UPDATE` on the session, count active bookings against capacity, consume a
 * credit, insert — belongs to F5, when there is a booking path to run it. Faza 0
 * only establishes the table and the two database-level guards that make that
 * transaction safe to write:
 *   - `booking_athlete_no_overlap_excl` (§5.3): the same athlete can never hold
 *     two overlapping active bookings, whatever the engine, trainer or role.
 *   - `booking_class_session_fk` ON UPDATE CASCADE (decyzja D4): the denormalised
 *     session times cannot drift from the session.
 * Capacity itself has no constraint and cannot have one — it is a COUNT against a
 * column, not a property of a single row — which is exactly why §5.2 specifies a
 * row lock and why no role has an override (US-14.2/AC3).
 */

/** Statuses that occupy a seat: everything except `cancelled` (§2.3). */
export const ACTIVE_BOOKING_FILTER = ne(booking.paymentStatus, "cancelled");

/**
 * Active bookings on a session — the participant list, and the input to the
 * capacity check.
 *
 * `payment_pending` counts as active. That is what lets an approved group-change
 * request hold a seat while the parent pays (US-11.3/AC2), and it is why an
 * expired request must cancel its booking rather than just forget about it.
 */
export async function listActiveBookingsForSession(
  tx: TenantDb,
  organizationId: string,
  sessionId: string,
) {
  return tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.organizationId, organizationId),
        eq(booking.sessionId, sessionId),
        ACTIVE_BOOKING_FILTER,
      ),
    );
}

/** Every booking (any status) for one athlete. */
export async function listBookingsForAthlete(
  tx: TenantDb,
  organizationId: string,
  athleteId: string,
) {
  return tx
    .select()
    .from(booking)
    .where(and(eq(booking.organizationId, organizationId), eq(booking.athleteId, athleteId)))
    .orderBy(booking.sessionStartTime);
}

/** One booking by id, or null. */
export async function getBooking(tx: TenantDb, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(booking)
    .where(and(eq(booking.id, id), eq(booking.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}
