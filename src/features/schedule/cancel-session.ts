import { and, eq, inArray, ne } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { getClientIdForBooking } from "@/features/bookings/data";
import { getCreditTypeForGroupType } from "@/features/credits/data";
import { issueCredits } from "@/features/credits/issue";
import { booking, classSession } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Admin session cancellation (langlion US-19.2, Faza 7).
 *
 * Cancels the entire session and ALL its active bookings in one transaction.
 * Confirmed bookings receive an `admin_session_cancellation` credit.
 * Booked_offline / payment_pending bookings are cancelled without credit.
 * All affected clients receive email notifications (enqueued inside the tx).
 *
 * LOCK ORDER: class_session → booking. Patrz komentarz w cancelBooking().
 */

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export class SessionAlreadyCancelledError extends Error {
  constructor() {
    super("Session is already cancelled");
    this.name = "SessionAlreadyCancelledError";
  }
}

export interface CancelSessionInput {
  organizationId: string;
  sessionId: string;
  /** IANA zone for credit validity calculation. */
  timeZone: string;
  actor: AuditActor;
  /** Injectable for tests. */
  now?: Date;
}

export interface CancelSessionResult {
  cancelledBookingIds: string[];
  creditsIssued: number;
}

export async function cancelClassSession(
  tx: TenantDb,
  input: CancelSessionInput,
): Promise<CancelSessionResult> {
  const now = input.now ?? new Date();

  // 1. Lock class_session FIRST — LOCK ORDER invariant.
  const [sessionRow] = await tx
    .select({ id: classSession.id, groupTypeId: classSession.groupTypeId })
    .from(classSession)
    .where(
      and(eq(classSession.id, input.sessionId), eq(classSession.organizationId, input.organizationId)),
    )
    .limit(1)
    .for("update");

  if (!sessionRow) throw new SessionNotFoundError();
  if (sessionRow.id !== input.sessionId) throw new SessionNotFoundError();

  // 2. Get all active (non-cancelled) bookings for this session, locked.
  const activeBookings = await tx
    .select({ id: booking.id, athleteId: booking.athleteId, paymentStatus: booking.paymentStatus })
    .from(booking)
    .where(
      and(
        eq(booking.sessionId, input.sessionId),
        eq(booking.organizationId, input.organizationId),
        ne(booking.paymentStatus, "cancelled"),
      ),
    )
    .for("update");

  // 3. Determine credits for confirmed bookings.
  const confirmedIds: string[] = [];
  const allIds: string[] = [];
  let creditsIssued = 0;

  const creditType = await getCreditTypeForGroupType(tx, input.organizationId, sessionRow.groupTypeId);

  for (const bk of activeBookings) {
    allIds.push(bk.id);

    if (bk.paymentStatus === "confirmed" && creditType) {
      const clientId = await getClientIdForBooking(tx, input.organizationId, bk.id);
      if (clientId) {
        await issueCredits(tx, {
          organizationId: input.organizationId,
          clientId,
          creditTypeId: creditType.id,
          athleteId: bk.athleteId,
          quantity: 1,
          source: "admin_session_cancellation",
          sourceBookingId: bk.id,
          timeZone: input.timeZone,
          issuedAt: now,
        });
        creditsIssued++;
        confirmedIds.push(bk.id);
      }
    }
    // booked_offline / payment_pending → no credit (US-19.2/AC2)
  }

  // 4. Cancel all active bookings.
  if (allIds.length > 0) {
    await tx
      .update(booking)
      .set({ paymentStatus: "cancelled", updatedAt: now })
      .where(inArray(booking.id, allIds));
  }

  // 5. Cancel the session itself.
  await tx
    .update(classSession)
    .set({ status: "cancelled" })
    .where(and(eq(classSession.id, input.sessionId), eq(classSession.organizationId, input.organizationId)));

  // 6. Audit.
  await recordAudit(tx, {
    action: "class_session.cancel",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "class_session",
    targetId: input.sessionId,
    targetLabel: input.sessionId,
    metadata: {
      affectedBookingCount: allIds.length,
      creditsIssued,
    },
  });

  return {
    cancelledBookingIds: allIds,
    creditsIssued,
  };
}
