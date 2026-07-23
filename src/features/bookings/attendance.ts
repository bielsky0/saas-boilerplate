import { and, eq } from "drizzle-orm";

import { recordAudit, type AuditActor } from "@/features/admin/audit";
import { booking, classSession } from "@/lib/db/schema";
import type { Role } from "@/features/rbac";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Attendance marking (langlion §2.29, EPIK 31, v15, Faza 6).
 *
 * Deliberately does NOT touch `paymentStatus` — see the header of
 * `attendanceStatus` in `lib/db/schema/bookings.ts` for why the two axes are
 * independent. `unmarked` is a legitimate target value (undoing a mark), not
 * just the default.
 *
 * "OWN SESSIONS ONLY" FOR A TRAINER cannot be expressed by the static RBAC map
 * (`bookings.mark_attendance` is granted to the trainer role generically) — it
 * is enforced HERE, by comparing the session's `trainerId` to the caller, the
 * same shape `getOwnedAthlete` uses for "not found if not yours" rather than a
 * generic 403, so a trainer probing another trainer's session id learns nothing
 * beyond "you may not do this here".
 */

export class BookingNotFoundError extends Error {}
/** A trainer tried to mark attendance on a session that is not theirs. */
export class ForeignSessionError extends Error {}

export interface MarkAttendanceInput {
  organizationId: string;
  bookingId: string;
  status: "unmarked" | "present" | "absent";
  markedByUserId: string;
  callerRole: Role;
  actor: AuditActor;
  now?: Date;
}

export interface MarkAttendanceResult {
  previousStatus: "unmarked" | "present" | "absent";
  sessionId: string;
}

export async function markAttendance(
  tx: TenantDb,
  input: MarkAttendanceInput,
): Promise<MarkAttendanceResult> {
  const now = input.now ?? new Date();

  const [row] = await tx
    .select({
      id: booking.id,
      sessionId: booking.sessionId,
      attendanceStatus: booking.attendanceStatus,
    })
    .from(booking)
    .where(and(eq(booking.id, input.bookingId), eq(booking.organizationId, input.organizationId)))
    .limit(1);
  if (!row) throw new BookingNotFoundError(input.bookingId);

  const [session] = await tx
    .select({ trainerId: classSession.trainerId })
    .from(classSession)
    .where(
      and(eq(classSession.id, row.sessionId), eq(classSession.organizationId, input.organizationId)),
    )
    .limit(1);
  if (!session) throw new BookingNotFoundError(input.bookingId);

  if (input.callerRole === "trainer" && session.trainerId !== input.markedByUserId) {
    throw new ForeignSessionError(row.sessionId);
  }

  const previousStatus = row.attendanceStatus;

  await tx
    .update(booking)
    .set({
      attendanceStatus: input.status,
      attendanceMarkedAt: now,
      attendanceMarkedByUserId: input.markedByUserId,
      updatedAt: now,
    })
    .where(and(eq(booking.id, input.bookingId), eq(booking.organizationId, input.organizationId)));

  await recordAudit(tx, {
    action: "booking.mark_attendance",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "booking",
    targetId: input.bookingId,
    targetLabel: input.bookingId,
    metadata: { previous: previousStatus, next: input.status },
  });

  return { previousStatus, sessionId: row.sessionId };
}
