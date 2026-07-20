import { foreignKey, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { athlete } from "./athletes";
import { booking } from "./bookings";
import { client } from "./clients";
import { creditType } from "./credit-types";
import { organization } from "./organizations";
import { user } from "./auth";

/**
 * Credit — the only settlement currency in langlion (§0 Zasada nadrzędna #2, §2.4).
 *
 * Every reservation reduces to the same event no matter how it was paid for:
 * one unit of this table is consumed. Cash at the desk, a card online, a
 * subscription renewal, an admin's goodwill, a cancellation refund — all six
 * `source` values produce the same row, and the booking path has exactly one
 * thing to do rather than six. That is what makes a single audit trail possible
 * instead of parallel mechanisms that agree only most of the time.
 *
 * TWO SOURCES ARE CREATED AND CONSUMED IN THE SAME TRANSACTION and never sit in a
 * wallet: `online_payment` (US-5.1/AC1, F11) and `on_site_payment` (US-6.1/AC1,
 * F6). They exist as rows because the ledger should record how the seat was paid
 * for, not because anyone ever chooses to spend them — hence US-7.6/AC3, where
 * such a payment leaves the parent's balance at zero.
 *
 * `athleteId` NULL is the FAMILY WALLET (§2.4, US-7.4): spendable on any of that
 * parent's children. A set value reserves the credit for one child. FIFO
 * consumption prefers the specific match over the family one (US-7.4/AC2), which
 * is why `consume.ts` orders on that expression rather than filtering on it.
 *
 * `validUntil` IS AN INSTANT, NOT A CALENDAR DATE, and this is a deliberate
 * departure from §1.2's "date" (decyzja D47). The spec's rule is "end of the
 * calendar month in `organization.timezone`" (US-1.2/AC3), so the zone has to be
 * applied somewhere. Applying it ONCE, when the credit is issued, turns expiry
 * into a single global `validUntil <= now()` comparison; storing a bare date
 * would push the zone into every reader, and the expiry sweep — which spans every
 * academy at once and therefore has no single zone — would compare a local date
 * against a UTC clock and expire credits up to a day early or late depending on
 * the tenant. Silently, because an early expiry looks exactly like a correct one.
 *
 * `creditPurchaseId` carries no foreign key: `credit_purchase` arrives in F12.
 * The column is here now so that adding the purchase path is a migration on ONE
 * table rather than two, and nothing writes it until then — the same shape, and
 * the same promise, as `booking.consumedCreditId` was in F0.
 *
 * Unions are stored as `text` per repo convention (no `pgEnum`), validated in
 * `features/credits/schema.ts`.
 */
export const credit = pgTable(
  "credit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The parent who owns the credit. Children never hold value of their own. */
    clientId: text("clientId").notNull(),
    creditTypeId: text("creditTypeId").notNull(),
    /** NULL = family wallet, spendable on any of this parent's children (§2.4). */
    athleteId: text("athleteId"),
    /** See the header: an instant, resolved from the academy's zone at issue time. */
    validUntil: timestamp("validUntil", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<"available" | "used" | "expired" | "refunded" | "pending_refund">()
      .notNull()
      .default("available"),
    source: text("source")
      .$type<
        | "cancellation"
        | "manual_admin_grant"
        | "on_site_payment"
        | "subscription_purchase"
        | "admin_session_cancellation"
        | "online_payment"
      >()
      .notNull(),
    /** Set when `source` is a cancellation of either kind — the booking compensated for. */
    sourceBookingId: text("sourceBookingId"),
    /** Both required when `source = manual_admin_grant` (US-7.3/AC1), enforced in the zod layer. */
    grantedByUserId: text("grantedByUserId").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason"),
    /** No FK until F12 brings `credit_purchase` — see header. */
    creditPurchaseId: text("creditPurchaseId"),
    /** The booking this credit was spent on. Written in the same transaction as `status = used`. */
    usedInBookingId: text("usedInBookingId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("credit_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.clientId, t.organizationId],
      foreignColumns: [client.id, client.organizationId],
      name: "credit_client_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.creditTypeId, t.organizationId],
      foreignColumns: [creditType.id, creditType.organizationId],
      name: "credit_credit_type_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.athleteId, t.organizationId],
      foreignColumns: [athlete.id, athlete.organizationId],
      name: "credit_athlete_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.sourceBookingId, t.organizationId],
      foreignColumns: [booking.id, booking.organizationId],
      name: "credit_source_booking_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [t.usedInBookingId, t.organizationId],
      foreignColumns: [booking.id, booking.organizationId],
      name: "credit_used_in_booking_fk",
    }).onDelete("restrict"),
    index("credit_org_idx").on(t.organizationId),
    /**
     * The FIFO index (§2.4, US-7.1). Column order mirrors the consumption query
     * exactly: equality on owner, parent and type, then equality on status, then
     * the ordering column last so the scan comes back already sorted and
     * `FOR UPDATE SKIP LOCKED` locks the earliest-expiring row first.
     */
    index("credit_fifo_idx").on(
      t.organizationId,
      t.clientId,
      t.creditTypeId,
      t.status,
      t.validUntil,
    ),
    /** The expiry sweep's access path: every academy at once, ordered by nothing else. */
    index("credit_expiry_idx").on(t.status, t.validUntil),
  ],
);
