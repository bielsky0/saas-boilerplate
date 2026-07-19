import { foreignKey, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { athlete } from "./athletes";
import { classSession } from "./class-sessions";
import { organization } from "./organizations";

/**
 * Booking — one athlete's place in one session (langlion §1.2, §5.2, §5.3).
 *
 * ⚠️ COLUMNS PROTECTED BY AN OBJECT DRIZZLE CANNOT SEE. `athleteId`,
 * `sessionStartTime`, `sessionEndTime` and `paymentStatus` participate in the
 * `booking_athlete_no_overlap_excl` EXCLUDE constraint, hand-written in the
 * migration. See the equivalent note in `sessions.ts` for the three consequences;
 * the short version is that `drizzle-kit push` would drop it and is banned.
 *
 * `sessionId` points at `class_session`, not at the auth `session` table — see
 * that module's header for why the langlion entity carries the `class_` prefix.
 *
 * WHY THE TIMES ARE DENORMALISED. An exclusion constraint can only read columns
 * of its own table, so "this athlete is not double-booked across overlapping
 * sessions" (§5.3) requires the session's time span to live here too. The obvious
 * risk is drift, and the usual mitigation is a rule ("update both in one
 * transaction") that every future edit path has to remember — §2.2, §3.4/AC3 and
 * the mass-move flows all touch session times.
 *
 * So it is not a rule here (decyzja D4). The composite foreign key below points
 * at `session (id, organizationId, startTime, endTime)` with ON UPDATE CASCADE:
 * moving a session rewrites its bookings' copies as part of the same statement,
 * and a move that would put an athlete in two places at once fails on the
 * exclusion constraint rather than corrupting the copy. US-3.4/AC7's "skip that
 * one session, carry on with the rest" then falls out of per-session
 * transactions instead of needing detection logic.
 *
 * `payment_status` union (validated in `features/bookings/schema.ts`):
 *   "payment_pending" | "booked_offline" | "confirmed" | "cancelled" | "no_show"
 * Everything except "cancelled" counts as occupying a seat (§2.3) — including
 * "payment_pending", which is what lets an approved group-change request hold a
 * place while the parent pays (US-11.3/AC2).
 */
export const booking = pgTable(
  "booking",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sessionId: text("sessionId").notNull(),
    athleteId: text("athleteId").notNull(),
    paymentStatus: text("paymentStatus")
      .$type<"payment_pending" | "booked_offline" | "confirmed" | "cancelled" | "no_show">()
      .notNull(),
    /**
     * The price and policy frozen at booking time (Zasada nadrzędna #1, US-4.6).
     * Carries the CURRENCY as well as the amount, not just the amount (§2.14): if
     * an academy ever changes `organization.currency`, historical frozen prices
     * must not silently re-denominate into the new one (US-24.2/AC1).
     * Amount is in minor units.
     */
    priceSnapshot: jsonb("priceSnapshot").$type<{ amount: number; currency: string }>().notNull(),
    /**
     * The credit this booking consumed (§2.4). No foreign key yet — the `credit`
     * table arrives in F4, which adds it. Deliberately not a dangling promise:
     * nothing writes this column until then.
     */
    consumedCreditId: text("consumedCreditId"),
    /** Denormalised from `session` — see header. Maintained by ON UPDATE CASCADE. */
    sessionStartTime: timestamp("sessionStartTime", { withTimezone: true }).notNull(),
    sessionEndTime: timestamp("sessionEndTime", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("booking_id_org_uq").on(t.id, t.organizationId),
    /**
     * One key doing two jobs: it keeps the booking in its session's tenant AND
     * keeps the denormalised times honest. Splitting them into two foreign keys
     * would express the same invariant with more objects and one more index.
     */
    foreignKey({
      columns: [t.sessionId, t.organizationId, t.sessionStartTime, t.sessionEndTime],
      foreignColumns: [
        classSession.id,
        classSession.organizationId,
        classSession.startTime,
        classSession.endTime,
      ],
      name: "booking_class_session_fk",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [t.athleteId, t.organizationId],
      foreignColumns: [athlete.id, athlete.organizationId],
      name: "booking_athlete_fk",
    }).onDelete("restrict"),
    index("booking_org_idx").on(t.organizationId),
    index("booking_session_idx").on(t.sessionId),
    index("booking_athlete_idx").on(t.athleteId),
  ],
);
