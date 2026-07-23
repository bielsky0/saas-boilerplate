import { and, eq } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { getOwnedAthlete } from "@/features/clients/data";
import { consumeCreditForBooking } from "@/features/credits/consume";
import { getCreditTypeForGroupType } from "@/features/credits/data";
import { booking, classSession } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";
import { countActiveBookingsForSession } from "./data";

/**
 * Dopisanie / Odrabianie (langlion EPIK 8, EPIK 13, Faza 7 D7).
 *
 * Books a session using an existing credit instead of a payment. FIFO consumption
 * naturally handles both flows:
 *   - Dopisanie: any available credit for the group type
 *   - Odrabianie: a `cancellation`-source credit (same mechanism — FIFO picks it)
 *
 * The audit metadata distinguishes: `bookingType: "extra_session"` vs `"makeup"`
 * based on the consumed credit's source.
 *
 * LOCK ORDER: class_session → booking insert → credit consumption.
 */

export class SessionNotScheduledError extends Error {
  constructor() {
    super("Session is not scheduled");
    this.name = "SessionNotScheduledError";
  }
}

export class SessionPastError extends Error {
  constructor() {
    super("Session has already started");
    this.name = "SessionPastError";
  }
}

export class SessionFullError extends Error {
  constructor() {
    super("Session is at capacity");
    this.name = "SessionFullError";
  }
}

export class NoCreditsAvailableError extends Error {
  constructor() {
    super("No available credits for this group type");
    this.name = "NoCreditsAvailableError";
  }
}

export class AthleteNotOwnedError extends Error {
  constructor() {
    super("Athlete does not belong to this client");
    this.name = "AthleteNotOwnedError";
  }
}

export interface DopisanieBookingInput {
  organizationId: string;
  sessionId: string;
  groupTypeId: string;
  clientId: string;
  athleteId: string;
  currency: string;
  actor: AuditActor;
  /** Injectable for tests. */
  now?: Date;
}

export interface DopisanieBookingResult {
  bookingId: string;
  consumedCreditId: string;
  bookingType: "extra_session" | "makeup";
}

export async function dopisanieBooking(
  tx: TenantDb,
  input: DopisanieBookingInput,
): Promise<DopisanieBookingResult> {
  const now = input.now ?? new Date();

  // 1. FOR UPDATE lock on session — LOCK ORDER: session first.
  const [session] = await tx
    .select({
      id: classSession.id,
      startTime: classSession.startTime,
      endTime: classSession.endTime,
      capacity: classSession.capacity,
    })
    .from(classSession)
    .where(
      and(eq(classSession.id, input.sessionId), eq(classSession.organizationId, input.organizationId)),
    )
    .limit(1)
    .for("update");

  if (!session) throw new SessionNotScheduledError();
  if (session.startTime <= now) throw new SessionPastError();

  // 2. Capacity check.
  const activeCount = await countActiveBookingsForSession(tx, input.organizationId, input.sessionId);
  if (activeCount >= session.capacity) throw new SessionFullError();

  // 3. Verify athlete belongs to client.
  const owned = await getOwnedAthlete(tx, input.organizationId, input.clientId, input.athleteId);
  if (!owned) throw new AthleteNotOwnedError();

  // 4. Get credit type for this group type.
  const creditType = await getCreditTypeForGroupType(tx, input.organizationId, input.groupTypeId);
  if (!creditType) throw new NoCreditsAvailableError();

  // 5. Insert booking as confirmed (paid by credit).
  const [inserted] = await tx
    .insert(booking)
    .values({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      athleteId: input.athleteId,
      paymentStatus: "confirmed",
      priceSnapshot: { amount: 0, currency: input.currency },
      sessionStartTime: session.startTime,
      sessionEndTime: session.endTime,
    })
    .returning({ id: booking.id });
  if (!inserted) throw new Error("dopisanieBooking: insert returned no row");

  // 6. Consume credit.
  const consumed = await consumeCreditForBooking(tx, {
    organizationId: input.organizationId,
    clientId: input.clientId,
    creditTypeId: creditType.id,
    athleteId: input.athleteId,
    bookingId: inserted.id,
    now,
  });

  if (!consumed) {
    // No credit available — roll back the booking insert by throwing.
    // The caller's transaction wrapper will abort the entire tx.
    throw new NoCreditsAvailableError();
  }

  // 7. Audit with bookingType distinction (D11).
  const bookingType = consumed.source === "cancellation" ? "makeup" : "extra_session";
  await recordAudit(tx, {
    action: "booking.create",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "booking",
    targetId: inserted.id,
    targetLabel: input.sessionId,
    metadata: {
      clientId: input.clientId,
      sessionId: input.sessionId,
      athleteId: input.athleteId,
      bookingType,
      consumedCreditId: consumed.creditId,
      consumedCreditSource: consumed.source,
      paymentStatus: "confirmed",
      priceSnapshot: { amount: 0, currency: input.currency },
    },
  });

  return {
    bookingId: inserted.id,
    consumedCreditId: consumed.creditId,
    bookingType,
  };
}
