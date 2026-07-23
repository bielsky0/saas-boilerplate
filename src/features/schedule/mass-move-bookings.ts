import { and, count, eq, ne } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { booking, classSession } from "@/lib/db/schema";
import { SQLSTATE_EXCLUSION_VIOLATION, sqlStateOf } from "@/lib/db/sql-error";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Mass Move Bookings (langlion US-21.4, §2.11, Faza 8).
 *
 * Alternative to cancelling a session with credits: move all participants to
 * another session of the same group type. Each participant is checked individually
 * for capacity (§5.2) and athlete collision (§5.3). Failing participants go to
 * a "needs manual intervention" list — they are NOT moved and do NOT receive
 * automatic credit (US-21.4/AC4).
 *
 * LOCK ORDER: sesje blokowane w kolejności rosnącej po session.id, NIE w
 * kolejności source→target. Zapobiega deadlockowi przy równoległych Mass Move
 * w przeciwnych kierunkach (A→B vs B→A).
 */

export interface MoveBookingFailure {
  bookingId: string;
  athleteId: string;
  reason: "capacity_exceeded" | "athlete_overlap";
}

export interface MassMoveBookingsReport {
  moved: number;
  failed: MoveBookingFailure[];
  total: number;
}

export class MassMoveTargetSameAsSourceError extends Error {
  constructor() {
    super("Target session is the same as source session");
    this.name = "MassMoveTargetSameAsSourceError";
  }
}

export class MassMoveDifferentGroupTypeError extends Error {
  constructor() {
    super("Target session must be of the same group type");
    this.name = "MassMoveDifferentGroupTypeError";
  }
}

export class MassMoveSessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "MassMoveSessionNotFoundError";
  }
}

export class MassMoveTargetCancelledError extends Error {
  constructor() {
    super("Target session is cancelled");
    this.name = "MassMoveTargetCancelledError";
  }
}

export class MassMoveTargetPastError extends Error {
  constructor() {
    super("Target session is in the past");
    this.name = "MassMoveTargetPastError";
  }
}

export interface MassMoveBookingsInput {
  organizationId: string;
  sourceSessionId: string;
  targetSessionId: string;
  actor: AuditActor;
  /** If true, also cancel the source session after moving. Default: true. */
  cancelSource?: boolean;
  now?: Date;
}

/**
 * Move all active bookings from one session to another of the same group type.
 * Returns a report of moved/failed counts.
 */
export async function massMoveBookings(
  tx: TenantDb,
  input: MassMoveBookingsInput,
): Promise<MassMoveBookingsReport> {
  const now = input.now ?? new Date();
  const cancelSource = input.cancelSource ?? true;

  if (input.sourceSessionId === input.targetSessionId) {
    throw new MassMoveTargetSameAsSourceError();
  }

  // LOCK ORDER: lock sessions in ascending id order to prevent deadlock.
  const [firstId, secondId] = [input.sourceSessionId, input.targetSessionId].sort();

  const [firstSession] = await tx
    .select()
    .from(classSession)
    .where(and(eq(classSession.id, firstId), eq(classSession.organizationId, input.organizationId)))
    .limit(1)
    .for("update");

  const [secondSession] = await tx
    .select()
    .from(classSession)
    .where(and(eq(classSession.id, secondId), eq(classSession.organizationId, input.organizationId)))
    .limit(1)
    .for("update");

  // Resolve which locked session is source vs target.
  const sourceSession = firstSession?.id === input.sourceSessionId ? firstSession : secondSession;
  const targetSession = firstSession?.id === input.targetSessionId ? firstSession : secondSession;

  if (!sourceSession || !targetSession) throw new MassMoveSessionNotFoundError();
  if (sourceSession.status === "cancelled") throw new MassMoveSessionNotFoundError();
  if (targetSession.status === "cancelled") throw new MassMoveTargetCancelledError();
  if (targetSession.startTime < now) throw new MassMoveTargetPastError();
  if (sourceSession.groupTypeId !== targetSession.groupTypeId) {
    throw new MassMoveDifferentGroupTypeError();
  }

  // Get all active bookings on the source session.
  const activeBookings = await tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.sessionId, input.sourceSessionId),
        eq(booking.organizationId, input.organizationId),
        ne(booking.paymentStatus, "cancelled"),
      ),
    );

  let moved = 0;
  const failed: MoveBookingFailure[] = [];

  // Compute current occupancy of target session.
  const targetOccupancy = await tx
    .select({ count: count(booking.id) })
    .from(booking)
    .where(
      and(
        eq(booking.sessionId, input.targetSessionId),
        eq(booking.organizationId, input.organizationId),
        ne(booking.paymentStatus, "cancelled"),
      ),
    )
    .limit(1)
    .then((r) => r[0]?.count ?? 0);

  const availableCapacity = targetSession.capacity - targetOccupancy;

  for (const bk of activeBookings) {
    // Check capacity first.
    if (moved >= availableCapacity) {
      failed.push({
        bookingId: bk.id,
        athleteId: bk.athleteId,
        reason: "capacity_exceeded",
      });
      continue;
    }

    // Try to move — the EXCLUDE constraint checks athlete collision.
    try {
      await tx.transaction(async (savepoint) => {
        // Lock this booking row within its savepoint.
        const [existing] = await savepoint
          .select({ id: booking.id })
          .from(booking)
          .where(and(eq(booking.id, bk.id), eq(booking.organizationId, input.organizationId)))
          .limit(1)
          .for("update");

        if (!existing) return; // Booking was cancelled in the meantime.

        await savepoint
          .update(booking)
          .set({
            sessionId: input.targetSessionId,
            sessionStartTime: targetSession.startTime,
            sessionEndTime: targetSession.endTime,
            updatedAt: now,
          })
          .where(
            and(eq(booking.id, bk.id), eq(booking.organizationId, input.organizationId)),
          );
      });
      moved += 1;
    } catch (error) {
      if (sqlStateOf(error) === SQLSTATE_EXCLUSION_VIOLATION) {
        failed.push({
          bookingId: bk.id,
          athleteId: bk.athleteId,
          reason: "athlete_overlap",
        });
        continue;
      }
      throw error;
    }
  }

  // Cancel source session if requested.
  if (cancelSource) {
    await tx
      .update(classSession)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(classSession.id, input.sourceSessionId),
          eq(classSession.organizationId, input.organizationId),
        ),
      );
  }

  // Audit.
  await recordAudit(tx, {
    action: "booking.mass_move",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "class_session",
    targetId: input.sourceSessionId,
    targetLabel: input.sourceSessionId,
    metadata: {
      targetSessionId: input.targetSessionId,
      moved,
      failed: failed.length,
      total: activeBookings.length,
    },
  });

  return {
    moved,
    failed,
    total: activeBookings.length,
  };
}
