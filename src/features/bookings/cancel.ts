import { and, eq } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { issueCredits } from "@/features/credits/issue";
import { booking } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";
import { getBookingWithSession, getClientIdForBooking } from "./data";
import { getCreditTypeForGroupType } from "@/features/credits/data";

/**
 * Booking cancellation (langlion EPIK 12, Faza 7).
 *
 * Single function for BOTH client self-service (24h rule) AND staff/admin paths
 * (bypass24h). The caller decides based on who is acting:
 *
 *   - Client self-service (US-12.1): `bypass24h: false` → 24h check enforced.
 *   - Staff with `bookings.cancel_reschedule` (US-12.2): `bypass24h: true` → any
 *     confirmed booking gets a cancellation credit regardless of time.
 *
 * LOCK ORDER: class_session zawsze przed booking, żeby uniknąć deadlocku
 * z cancelClassSession(). Nie zmieniać kolejności bez aktualizacji obu ścieżek.
 */

export class BookingNotFoundError extends Error {
  constructor() {
    super("Booking not found");
    this.name = "BookingNotFoundError";
  }
}

export class BookingAlreadyCancelledError extends Error {
  constructor() {
    super("Booking is already cancelled");
    this.name = "BookingAlreadyCancelledError";
  }
}

export class CancellationTooLateError extends Error {
  constructor() {
    super("Cancellation is less than 24 hours before the session starts");
    this.name = "CancellationTooLateError";
  }
}

export class CancellationBlockedByChangeRequestError extends Error {
  constructor() {
    super("Booking has an active group change request");
    this.name = "CancellationBlockedByChangeRequestError";
  }
}

export interface CancelBookingInput {
  organizationId: string;
  bookingId: string;
  /** IANA zone for credit validity calculation (e.g. "Europe/Warsaw"). */
  timeZone: string;
  /** The staff audit actor. For client self-service, pass `clientActor()`. */
  actor: AuditActor;
  /** True to skip the 24h check — staff/admin path (US-12.2). */
  bypass24h?: boolean;
  /** Injectable for tests. */
  now?: Date;
}

export interface CancelBookingResult {
  sessionId: string;
  athleteId: string;
  creditIssued: boolean;
  creditId?: string;
}

export async function cancelBooking(
  tx: TenantDb,
  input: CancelBookingInput,
): Promise<CancelBookingResult> {
  const now = input.now ?? new Date();

  // 1. Lock class_session FIRST, then booking — enforces LOCK ORDER invariant.
  const row = await getBookingWithSession(tx, input.organizationId, input.bookingId, {
    lockSession: true,
  });
  if (!row) throw new BookingNotFoundError();
  if (row.paymentStatus === "cancelled") throw new BookingAlreadyCancelledError();

  // 2. Lock the booking row itself (FOR UPDATE on the specific row).
  const [bookingRow] = await tx
    .select({ id: booking.id, paymentStatus: booking.paymentStatus })
    .from(booking)
    .where(
      and(eq(booking.id, input.bookingId), eq(booking.organizationId, input.organizationId)),
    )
    .limit(1)
    .for("update");
  if (!bookingRow) throw new BookingNotFoundError();

  // 3. 24h rule (US-12.1/AC1) — skip if bypass24h (US-12.2).
  if (!input.bypass24h) {
    const hoursUntil = (row.sessionStartTime.getTime() - now.getTime()) / 3_600_000;
    if (hoursUntil < 24) {
      throw new CancellationTooLateError();
    }
  }

  // 4. US-12.3: check for active group change request (deferred to F15).
  // TODO(F15): replace stub with real hasActiveGroupChangeRequest() check.
  // if (await hasActiveGroupChangeRequest(tx, input.organizationId, input.bookingId)) {
  //   throw new CancellationBlockedByChangeRequestError();
  // }

  // 5. Determine credit issuance.
  let creditIssued = false;
  let creditId: string | undefined;

  if (row.paymentStatus === "confirmed") {
    const creditType = await getCreditTypeForGroupType(tx, input.organizationId, row.groupTypeId);
    if (creditType) {
      const clientId = await getClientIdForBooking(tx, input.organizationId, input.bookingId);
      if (clientId) {
        const issued = await issueCredits(tx, {
          organizationId: input.organizationId,
          clientId,
          creditTypeId: creditType.id,
          athleteId: row.athleteId,
          quantity: 1,
          source: "cancellation",
          sourceBookingId: input.bookingId,
          timeZone: input.timeZone,
          issuedAt: now,
        });
        creditIssued = true;
        creditId = issued[0]?.id;
      }
    }
  }
  // `booked_offline` / `payment_pending` → no credit (US-12.1/AC3, US-12.2/AC2).

  // 6. Update booking to cancelled.
  await tx
    .update(booking)
    .set({ paymentStatus: "cancelled", updatedAt: now })
    .where(eq(booking.id, input.bookingId));

  // 7. Audit.
  const action = input.bypass24h ? "booking.cancel_admin" : "booking.cancel";
  await recordAudit(tx, {
    action,
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "booking",
    targetId: input.bookingId,
    targetLabel: input.bookingId,
    metadata: {
      athleteId: row.athleteId,
      sessionId: row.sessionId,
      previousPaymentStatus: row.paymentStatus,
      credited: creditIssued,
      creditId: creditId ?? null,
    },
  });

  return {
    sessionId: row.sessionId,
    athleteId: row.athleteId,
    creditIssued,
    creditId,
  };
}
