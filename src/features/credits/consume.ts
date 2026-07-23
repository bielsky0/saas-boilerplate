import { and, eq, sql } from "drizzle-orm";

import { booking, credit } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * FIFO credit consumption (langlion §0 Zasada nadrzędna #2, §2.4, US-7.1, US-7.2).
 *
 * THE SINGLE PLACE A CREDIT IS SPENT. Every booking path — the public signup
 * (F5), cash confirmation at the desk (F6), self-service add-on and make-up
 * classes (F7), package auto-fill (F12), group change (F15) — ends here. That is
 * not tidiness: consumption has to be atomic with the seat check and the booking
 * insert, and a second implementation would be a second chance to get the
 * atomicity wrong in a way that only shows up under concurrency.
 *
 * ⚠️ THIS FUNCTION NEVER OPENS A TRANSACTION, and callers must not treat that as
 * an oversight to work around. §5.2 requires the capacity lock, the credit
 * consumption and the booking insert to be ONE transaction — if consumption
 * committed separately, a booking that then failed the capacity check would leave
 * the parent's credit spent on nothing. Take a `TenantDb` from your own
 * `withTenant`, do the seat work and this in the same handle.
 */

import type { CreditSource } from "./schema";

/** A credit the caller has taken and must now spend, or roll back. */
export type ClaimedCredit = {
  id: string;
  validUntil: Date;
  athleteId: string | null;
  /** The source tells the caller what kind of credit was consumed (F7 D11). */
  source: CreditSource;
};

/**
 * Take the credit that should be spent next, locking it for this transaction.
 *
 * ORDERING IS THE SPEC (US-7.1, US-7.4/AC2), in two keys:
 *
 *   1. a credit reserved for THIS child before a family one. Spending the family
 *      credit first would strand the reserved one — it can only ever be used by
 *      one child, so burning the fungible unit first is strictly worse for the
 *      parent, and invisibly so.
 *   2. then earliest `validUntil`. First-in-first-out means the unit closest to
 *      expiring, not the oldest by creation: a credit bought later may expire
 *      sooner, and spending the durable one first would let value evaporate that
 *      the parent had already paid for.
 *
 * `FOR UPDATE SKIP LOCKED` IS THE CONCURRENCY GUARD, and each half does a job.
 * `FOR UPDATE` stops two transactions from spending one credit: the second waits
 * on the row lock and, once the first commits, its own `status = 'available'`
 * predicate no longer holds. `SKIP LOCKED` stops that wait from turning into a
 * queue — a second booking for the same parent skips past the contended row to
 * the next available credit instead of blocking behind a transaction that also
 * holds a session lock. Without it, two parallel bookings by one family can
 * deadlock through the §5.2 capacity lock.
 *
 * Selecting with a plain SELECT and updating afterwards would look equivalent and
 * would not be: two transactions can both read the same row as available before
 * either writes, and both proceed to spend it (US-7.2). Same shape of hole as
 * D38's OTP redemption; same answer — let the database serialise it.
 *
 * Returns null when the parent has nothing spendable of this type. That is an
 * ordinary outcome, not an error: it is what routes a client to the purchase path
 * (US-8.1/AC2).
 */
export async function claimCredit(
  tx: TenantDb,
  input: {
    organizationId: string;
    clientId: string;
    creditTypeId: string;
    /** The child the booking is for; matches both reserved and family credits. */
    athleteId: string;
    /** Injectable for tests; defaults to now. Compared against `validUntil`. */
    now?: Date;
  },
): Promise<ClaimedCredit | null> {
  const now = input.now ?? new Date();

  /*
   * Raw SQL rather than the query builder, for one reason: Drizzle has no
   * `.for("update", { skipLocked: true })` that composes with `orderBy` on an
   * expression, and expressing the guard approximately would be worse than
   * expressing it explicitly. Parameterised throughout — no interpolation.
   *
   * `validUntil > now` is a strict comparison because `validUntil` is an
   * EXCLUSIVE bound (see `validity.ts`): the boundary instant is the first moment
   * the credit is dead, so it must not still be spendable.
   *
   * The instant is bound as an ISO STRING with an explicit `::timestamptz` cast:
   * the postgres-js driver rejects a `Date` passed through a raw template
   * (ERR_INVALID_ARG_TYPE), and without the cast the comparison would be
   * text-versus-timestamp. The query builder handles this for us elsewhere; raw
   * SQL is the one place it has to be said.
   */
  const claimed = await tx.execute<{
    id: string;
    validUntil: string;
    athleteId: string | null;
    source: string;
  }>(
    sql`
      select "id", "validUntil", "athleteId", "source", "source"
      from "credit"
      where "organizationId" = ${input.organizationId}
        and "clientId" = ${input.clientId}
        and "creditTypeId" = ${input.creditTypeId}
        and "status" = 'available'
        and "validUntil" > ${now.toISOString()}::timestamptz
        and ("athleteId" is null or "athleteId" = ${input.athleteId})
      order by ("athleteId" is null), "validUntil"
      limit 1
      for update skip locked
    `,
  );

  // `Array.from` rather than indexing: the postgres-js driver returns a RowList,
  // which is array-LIKE but not an array, and the repo's existing raw-SQL reader
  // (`api/dev/rls-probe`) normalises it the same way.
  const row = Array.from(claimed)[0] ?? null;
  if (!row) return null;
  return { id: row.id, validUntil: new Date(row.validUntil), athleteId: row.athleteId, source: row.source as CreditSource };
}

/**
 * Mark a claimed credit as spent on a booking, and record the link on both rows.
 *
 * BOTH DIRECTIONS, ALWAYS TOGETHER. `credit.usedInBookingId` and
 * `booking.consumedCreditId` are redundant by the spec's own model (§1.2 defines
 * both), which makes them a drift risk with exactly one mitigation: a single
 * writer. This is it. Writing one without the other produces a ledger that
 * disagrees with itself, and nothing would notice until a refund tried to reason
 * about which credits were spent.
 *
 * The `status = 'available'` predicate is belt-and-braces on top of the row lock
 * `claimCredit` already holds: if the guard above were ever weakened, this update
 * would touch zero rows and the caller's assertion would fail loudly rather than
 * double-spending quietly.
 */
export async function spendCredit(
  tx: TenantDb,
  input: {
    organizationId: string;
    creditId: string;
    bookingId: string;
  },
): Promise<void> {
  const updated = await tx
    .update(credit)
    .set({ status: "used", usedInBookingId: input.bookingId, updatedAt: new Date() })
    .where(
      and(
        eq(credit.id, input.creditId),
        eq(credit.organizationId, input.organizationId),
        eq(credit.status, "available"),
      ),
    )
    .returning({ id: credit.id });

  if (updated.length === 0) {
    // Unreachable while `claimCredit` holds the lock — so reaching it means the
    // guard moved, and continuing would spend a credit twice. Fail the enclosing
    // transaction instead, which also rolls back the booking.
    throw new Error(`credit ${input.creditId} was not available at spend time`);
  }

  await tx
    .update(booking)
    .set({ consumedCreditId: input.creditId, updatedAt: new Date() })
    .where(and(eq(booking.id, input.bookingId), eq(booking.organizationId, input.organizationId)));
}

/**
 * Claim and spend in one call — the shape every booking path actually wants.
 *
 * Returns the credit id, or null when there was nothing to spend. The caller
 * decides what null means: the public signup routes to a purchase, cash
 * confirmation at the desk reports "no credit yet".
 */
export async function consumeCreditForBooking(
  tx: TenantDb,
  input: {
    organizationId: string;
    clientId: string;
    creditTypeId: string;
    athleteId: string;
    bookingId: string;
    now?: Date;
  },
): Promise<{ creditId: string; source: CreditSource } | null> {
  const claimed = await claimCredit(tx, input);
  if (!claimed) return null;
  await spendCredit(tx, {
    organizationId: input.organizationId,
    creditId: claimed.id,
    bookingId: input.bookingId,
  });
  return { creditId: claimed.id, source: claimed.source };
}
