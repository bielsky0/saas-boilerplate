import { check, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";

/**
 * User connection (etap 5, faza 5.2 — profile "connections").
 *
 * Symmetric-by-construction: exactly one row per unordered pair, enforced by
 * storing the two ids ordered (`userLowId < userHighId` + CHECK) with a unique
 * constraint on the pair. No pending/request states — connecting is mutual
 * and immediate (unlike org invitations, which gate access and need them).
 * A user can always see and delete their own connections; nothing here is
 * visible to third parties.
 */
export const userConnection = pgTable(
  "user_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userLowId: text("userLowId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userHighId: text("userHighId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("user_connection_pair_uq").on(t.userLowId, t.userHighId),
    index("user_connection_low_idx").on(t.userLowId),
    index("user_connection_high_idx").on(t.userHighId),
    check("user_connection_order_ck", sql`${t.userLowId} < ${t.userHighId}`),
    check("user_connection_distinct_ck", sql`${t.userLowId} <> ${t.userHighId}`),
  ],
);

/** Canonical ordered pair — the single place that decides low/high. */
export function orderedPair(a: string, b: string): [low: string, high: string] {
  return a < b ? [a, b] : [b, a];
}

export function connectionCounterpart(
  row: { userLowId: string; userHighId: string },
  userId: string,
): string {
  return row.userLowId === userId ? row.userHighId : row.userLowId;
}
