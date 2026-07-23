import { and, count, eq, gte, lt, ne, sql } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { athlete, booking, classSession, location } from "@/lib/db/schema";

/**
 * Booking data access (langlion §1.2, §2.3, §5.2).
 *
 * Same two conventions as `features/locations/data.ts`: a `TenantDb` handle, and
 * an explicit `organizationId` filter that RLS backs up rather than replaces.
 *
 * THE SEAT-TAKING TRANSACTION OF §5.2 LIVES IN `create.ts` (F5), not here — one
 * writer, so that the row lock is taken the same way by every path that consumes
 * a seat. This module supplies its input (`countActiveBookingsForSession`) and
 * the read the public calendar displays (`listSessionAvailability`), which are
 * deliberately NOT the same query: see the note on the latter.
 *
 * The two database-level guards that make that transaction safe to write:
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

/**
 * How many seats a session has taken — the authoritative capacity input (§5.2).
 *
 * A scalar rather than `listActiveBookingsForSession(...).length`, because the
 * caller runs inside the hot transaction while holding a row lock on the session:
 * every row it does not fetch is time no other parent can book that session. The
 * participant list is a different need (F6's roster) with a different shape.
 *
 * MUST be called while holding `FOR UPDATE` on the session row, or the number is
 * a guess. See `create.ts` for why the lock, not the transaction, is what makes
 * this correct under READ COMMITTED.
 */
export async function countActiveBookingsForSession(
  tx: TenantDb,
  organizationId: string,
  sessionId: string,
): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(booking)
    .where(
      and(
        eq(booking.organizationId, organizationId),
        eq(booking.sessionId, sessionId),
        ACTIVE_BOOKING_FILTER,
      ),
    );
  return row?.value ?? 0;
}

/** One bookable slot as the public enrollment calendar sees it. */
export interface SessionAvailability {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  activeCount: number;
  locationName: string | null;
}

/**
 * Sessions of one offer in a date range, with how full each one is (F5, EPIK 4).
 *
 * ⚠️ THIS COUNT IS ADVISORY, AND THAT IS BY DESIGN. It is what a parent SEES; it
 * is not what decides a booking. The authoritative count runs in `create.ts`
 * under `FOR UPDATE`, and the gap between the two is the entire user-visible
 * behaviour of EPIK 15: a slot can fill between the page render and the confirm
 * click, and the honest answer then is a message, not a waiting list. Code that
 * treats this number as a guarantee has reintroduced the check-then-act race that
 * Zasada nadrzędna #3 exists to remove.
 *
 * NO `FOR UPDATE` HERE, deliberately. This read serves anonymous page views; a
 * lock would serialise every visitor browsing a popular offer behind whichever
 * one of them is currently in a booking transaction.
 *
 * One statement, not one-plus-N. `ACTIVE_BOOKING_FILTER` sits in the JOIN
 * predicate rather than a WHERE, so a session with zero bookings still returns a
 * row (with `activeCount = 0`) instead of vanishing from the calendar — moving it
 * to WHERE would hide exactly the emptiest, most bookable sessions.
 */
export async function listSessionAvailability(
  tx: TenantDb,
  organizationId: string,
  params: { groupTypeId: string; from: Date; to: Date; now?: Date },
): Promise<SessionAvailability[]> {
  const now = params.now ?? new Date();

  return tx
    .select({
      sessionId: classSession.id,
      startTime: classSession.startTime,
      endTime: classSession.endTime,
      capacity: classSession.capacity,
      activeCount: sql<number>`count(${booking.id})::int`,
      locationName: location.name,
    })
    .from(classSession)
    .leftJoin(location, eq(location.id, classSession.locationId))
    .leftJoin(booking, and(eq(booking.sessionId, classSession.id), ACTIVE_BOOKING_FILTER))
    .where(
      and(
        eq(classSession.organizationId, organizationId),
        eq(classSession.groupTypeId, params.groupTypeId),
        eq(classSession.status, "scheduled"),
        gte(classSession.startTime, params.from),
        lt(classSession.startTime, params.to),
        // A session that already started is not an offer. Filtered in SQL rather
        // than in the calendar layer so "bookable" means the same thing to the
        // page and to anything else that reads this.
        gte(classSession.startTime, now),
      ),
    )
    .groupBy(
      classSession.id,
      classSession.startTime,
      classSession.endTime,
      classSession.capacity,
      location.name,
    )
    .orderBy(classSession.startTime);
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

/** One session's roster with the participant name — F6's staff panel view. */
export interface RosterRow {
  bookingId: string;
  athleteId: string;
  athleteName: string;
  paymentStatus: "payment_pending" | "booked_offline" | "confirmed" | "cancelled" | "no_show";
  attendanceStatus: "unmarked" | "present" | "absent";
}

export async function listRosterForSession(
  tx: TenantDb,
  organizationId: string,
  sessionId: string,
): Promise<RosterRow[]> {
  return tx
    .select({
      bookingId: booking.id,
      athleteId: booking.athleteId,
      athleteName: athlete.name,
      paymentStatus: booking.paymentStatus,
      attendanceStatus: booking.attendanceStatus,
    })
    .from(booking)
    .innerJoin(
      athlete,
      and(eq(athlete.id, booking.athleteId), eq(athlete.organizationId, booking.organizationId)),
    )
    .where(
      and(
        eq(booking.organizationId, organizationId),
        eq(booking.sessionId, sessionId),
        ACTIVE_BOOKING_FILTER,
      ),
    )
    .orderBy(athlete.name);
}
