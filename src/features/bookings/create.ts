import { and, eq } from "drizzle-orm";

import { clientActor, recordAudit } from "@/features/admin/audit";
import { getOwnedAthlete, insertAthlete } from "@/features/clients/data";
import { booking, classSession } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";
import { isMethodAcceptable } from "./payment-options";
import { countActiveBookingsForSession } from "./data";
import type { PriceSnapshot } from "./schema";

/**
 * THE seat-taking transaction (§5.2, §2.3, EPIK 4/14). One writer, on purpose.
 *
 * Every path that consumes a seat — this public booking (F5), the receptionist's
 * cash confirmation (F6), the group-change swap (F15), online checkout (F11) —
 * MUST call this rather than writing its own transaction. That is the mechanism
 * behind US-14.2/AC2's "all paths go through the same lock": the capacity
 * guarantee is a property of taking THIS row lock FIRST, and it holds only while
 * there is exactly one place that takes it. `credits/consume.ts` makes the same
 * argument about being the only writer of the credit pair.
 *
 * WHY THE COUNT IS SAFE UNDER READ COMMITTED. The `FOR UPDATE` on the session row
 * serialises every booker of that session: the loser blocks on the lock until the
 * winner commits, so its `countActiveBookingsForSession` runs AFTER the winner's
 * row exists and sees it. This is a property of the lock, not of the transaction
 * isolation level — two `READ COMMITTED` transactions without the lock would both
 * read the old count and both insert. Take the lock first, always, so lock
 * ordering is fixed and F7's credit lock (`FOR UPDATE SKIP LOCKED`) nests under
 * it without deadlock.
 *
 * Capacity has NO database constraint and cannot have one: it is a COUNT against a
 * column, not a property of one row. That is why §5.2 is a lock rather than a
 * constraint, and why no role has an override (US-14.2/AC3, US-14.5/AC2). The
 * athlete-overlap guard (§5.3) IS a constraint, so it surfaces as a caught 23P01,
 * not a pre-check — see the caller's error branching.
 */

/** No session with this id in this academy, or it belongs to a different offer. */
export class UnknownSessionError extends Error {}
/** The session was cancelled after it was shown on the calendar. */
export class SessionCancelledError extends Error {}
/** The session already started; a past slot is never bookable. */
export class SessionPastError extends Error {}
/** The chosen payment method is outside the offer's policy or unavailable (Constraint 7). */
export class PaymentMethodUnavailableError extends Error {}
/** The athlete is not this parent's child (RLS scopes the tenant, not the parent). */
export class ForeignAthleteError extends Error {}
/** The session is at capacity — NOT a constraint violation (see header). */
export class SessionFullError extends Error {}

export interface CreateBookingInput {
  organizationId: string;
  /** The offer whose page this booking came from — a session from another offer is refused. */
  groupType: {
    id: string;
    price: number;
    paymentPolicy: "online" | "on_site" | "both";
    allowedPurchaseModes: readonly ("single_class" | "package")[];
  };
  /** The academy's currency, frozen into the snapshot at booking time (§2.14). */
  currency: string;
  /** The verified parent taking the seat. */
  client: { id: string; email: string };
  sessionId: string;
  paymentMethod: "online" | "on_site";
  /** An existing child of this parent, or a new one to create in this transaction. */
  participant:
    { kind: "existing"; athleteId: string } | { kind: "new"; name: string; age?: number };
  /** F5: Stripe is not built, so on-site only. F10/F11 pass the real Connect status. */
  onlineAvailable: boolean;
  now?: Date;
  /**
   * TEST-ONLY. Invoked once the session row lock is held, before the capacity
   * count. A fixture uses it to sleep, keeping the lock held so a second booker
   * genuinely BLOCKS on it — that is what makes the race in the concurrency spec
   * real rather than two transactions that happened not to overlap. Production
   * never sets it. Placed after the lock and before the count on purpose: earlier
   * and there is no lock to hold, later and the winner has already counted.
   */
  onLocked?: () => Promise<void>;
}

export interface CreateBookingResult {
  bookingId: string;
  athleteId: string;
  paymentStatus: "booked_offline" | "payment_pending";
  priceSnapshot: PriceSnapshot;
}

/**
 * Run the whole thing in one `withTenant` transaction (the CALLER opens it, so
 * the audit write shares it — Rule A). Throws one of the typed errors above,
 * which the action layer maps to a field message.
 */
export async function createBooking(
  tx: TenantDb,
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const now = input.now ?? new Date();

  // 1. Lock the session row FIRST — the same shape as schedule/actions.ts:112,
  //    whose comment already names this call site. Everything else nests under it.
  const [session] = await tx
    .select()
    .from(classSession)
    .where(
      and(
        eq(classSession.id, input.sessionId),
        eq(classSession.organizationId, input.organizationId),
      ),
    )
    .limit(1)
    .for("update");

  // 2. Refusals that the lock now makes race-free to check.
  if (!session) throw new UnknownSessionError(input.sessionId);
  // The row lock is now genuinely held; a fixture can hold it here so a second
  // booker blocks. Placed after the existence check so there is actually a lock.
  if (input.onLocked) await input.onLocked();
  // A session id from a DIFFERENT offer must not be bookable through this page.
  if (session.groupTypeId !== input.groupType.id) throw new UnknownSessionError(input.sessionId);
  if (session.status !== "scheduled") throw new SessionCancelledError(input.sessionId);
  if (session.startTime <= now) throw new SessionPastError(input.sessionId);

  // 3. Payment method must be in policy AND available right now (Constraint 7,
  //    F5 decision F). Enforced HERE, not in the action, so F6/F11 inherit it.
  const acceptable = isMethodAcceptable(
    {
      paymentPolicy: input.groupType.paymentPolicy,
      allowedPurchaseModes: input.groupType.allowedPurchaseModes,
    },
    input.paymentMethod,
    { onlineAvailable: input.onlineAvailable },
  );
  if (!acceptable) throw new PaymentMethodUnavailableError(input.paymentMethod);

  // 4. Resolve the athlete. Existing → must be THIS parent's child (the only guard
  //    against booking a stranger's child). New → created in this transaction.
  let athleteId: string;
  if (input.participant.kind === "existing") {
    const owned = await getOwnedAthlete(
      tx,
      input.organizationId,
      input.client.id,
      input.participant.athleteId,
    );
    if (!owned) throw new ForeignAthleteError(input.participant.athleteId);
    athleteId = owned.id;
  } else {
    athleteId = await insertAthlete(tx, input.organizationId, input.client.id, {
      name: input.participant.name,
      age: input.participant.age,
    });
  }

  // 5. Capacity, under the lock taken in step 1. `payment_pending` counts (§2.3).
  const activeCount = await countActiveBookingsForSession(
    tx,
    input.organizationId,
    input.sessionId,
  );
  if (activeCount >= session.capacity) throw new SessionFullError(input.sessionId);

  // 6. Insert. Times COPIED from the locked row — the composite FK
  //    booking_class_session_fk rejects any other value. Price read now, never
  //    joined at read time (US-4.6, §2.14).
  const priceSnapshot: PriceSnapshot = { amount: input.groupType.price, currency: input.currency };
  const paymentStatus = input.paymentMethod === "on_site" ? "booked_offline" : "payment_pending";

  const [row] = await tx
    .insert(booking)
    .values({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      athleteId,
      paymentStatus,
      priceSnapshot,
      sessionStartTime: session.startTime,
      sessionEndTime: session.endTime,
    })
    .returning({ id: booking.id });
  if (!row) throw new Error("createBooking: insert returned no row");

  // 7. Audit, same transaction. The actor is the parent; its id cannot go in
  //    actorUserId (FK to user), so it rides in metadata — see clientActor.
  await recordAudit(tx, {
    action: "booking.create",
    actor: clientActor(input.client.email),
    organizationId: input.organizationId,
    targetType: "booking",
    targetId: row.id,
    targetLabel: session.startTime.toISOString(),
    metadata: {
      clientId: input.client.id,
      sessionId: input.sessionId,
      athleteId,
      groupTypeId: input.groupType.id,
      paymentStatus,
      priceSnapshot,
    },
  });

  return { bookingId: row.id, athleteId, paymentStatus, priceSnapshot };
}
