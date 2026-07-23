import { and, eq } from "drizzle-orm";

import { recordAudit, type AuditActor } from "@/features/admin/audit";
import { getCreditTypeForGroupType } from "@/features/credits/data";
import { issueCredits } from "@/features/credits/issue";
import { spendCredit } from "@/features/credits/consume";
import { athlete, booking, classSession } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Cash confirmation at the desk (langlion §2.29, US-6.1, EPIK 6/16, Faza 6).
 *
 * The FIRST call site that actually spends the `on_site_payment` credit source
 * modelled in F4 (`credits/schema.ts`): F5's `booked_offline` bookings do not
 * consume a credit at all (they hold the seat on `paymentStatus` alone), so this
 * is where "created and consumed in the same transaction and never sit in a
 * wallet" (see `./credits/credits.ts` header) is exercised for the first time.
 *
 * One `tx`, four writes: issue the credit, spend it onto this booking, flip
 * `paymentStatus` to `confirmed`, and audit — all or nothing. The caller opens
 * the transaction (Rule A, same shape as `createBooking`).
 *
 * NOT restricted to a trainer's own sessions — unlike `markAttendance`/grade
 * entry, §2.10 gives `credits.confirm_on_site` to trainer and reception on equal
 * footing with no "own session" qualifier in the spec.
 */

export class BookingNotFoundError extends Error {}
/** Already confirmed, cancelled, or never had an offline payment to confirm. */
export class BookingNotConfirmableError extends Error {}
/** The offer has no matching `credit_type` yet — a configuration gap, not a bug. */
export class NoCreditTypeError extends Error {}

export interface ConfirmCashPaymentInput {
  organizationId: string;
  bookingId: string;
  /** IANA zone from `organization.timezone` — never the server's (US-1.2/AC3). */
  timeZone: string;
  actor: AuditActor;
  now?: Date;
}

export interface ConfirmCashPaymentResult {
  creditId: string;
  sessionId: string;
}

export async function confirmCashPayment(
  tx: TenantDb,
  input: ConfirmCashPaymentInput,
): Promise<ConfirmCashPaymentResult> {
  const now = input.now ?? new Date();

  // Lock the booking row first — nobody else may confirm or cancel it underneath us.
  const [row] = await tx
    .select()
    .from(booking)
    .where(and(eq(booking.id, input.bookingId), eq(booking.organizationId, input.organizationId)))
    .limit(1)
    .for("update");
  if (!row) throw new BookingNotFoundError(input.bookingId);
  if (row.paymentStatus !== "booked_offline") {
    throw new BookingNotConfirmableError(row.paymentStatus);
  }

  const [session] = await tx
    .select({ groupTypeId: classSession.groupTypeId })
    .from(classSession)
    .where(
      and(
        eq(classSession.id, row.sessionId),
        eq(classSession.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!session) throw new BookingNotFoundError(input.bookingId);

  const [child] = await tx
    .select({ parentClientId: athlete.parentClientId })
    .from(athlete)
    .where(and(eq(athlete.id, row.athleteId), eq(athlete.organizationId, input.organizationId)))
    .limit(1);
  if (!child) throw new BookingNotFoundError(input.bookingId);

  const creditType = await getCreditTypeForGroupType(tx, input.organizationId, session.groupTypeId);
  if (!creditType) throw new NoCreditTypeError(session.groupTypeId);

  const [issued] = await issueCredits(tx, {
    organizationId: input.organizationId,
    clientId: child.parentClientId,
    creditTypeId: creditType.id,
    athleteId: row.athleteId,
    quantity: 1,
    source: "on_site_payment",
    timeZone: input.timeZone,
    issuedAt: now,
  });
  if (!issued) throw new Error("confirmCashPayment: issueCredits returned no row");

  await spendCredit(tx, {
    organizationId: input.organizationId,
    creditId: issued.id,
    bookingId: input.bookingId,
  });

  await tx
    .update(booking)
    .set({ paymentStatus: "confirmed", updatedAt: now })
    .where(and(eq(booking.id, input.bookingId), eq(booking.organizationId, input.organizationId)));

  await recordAudit(tx, {
    action: "booking.confirm_cash",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "booking",
    targetId: input.bookingId,
    targetLabel: input.bookingId,
    metadata: {
      creditId: issued.id,
      creditTypeId: creditType.id,
      clientId: child.parentClientId,
      athleteId: row.athleteId,
    },
  });

  return { creditId: issued.id, sessionId: row.sessionId };
}
