import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { organization } from "./organizations";

/**
 * One-time bridge for a staff session across a host switch (langlion §2.19
 * exception #5, plan Faza 5.5 / decyzja D74).
 *
 * The staff session cookie is host-scoped by design (D70, `trustedOrigins`, not
 * `crossSubDomainCookies`) and that is not touched here. This table exists only
 * to carry an ALREADY-AUTHENTICATED user's identity across the two specific,
 * one-time redirects where the apex and the tenant host disagree about who is
 * signed in: creating an organization and accepting an invitation (both land on
 * the apex directory per D71, then the user clicks into the academy's own host,
 * which has never seen their cookie).
 *
 * THE RAW TOKEN IS NEVER STORED, only its SHA-256 `tokenHash` — the same
 * treatment `invitation.tokenHash` and `client_otp.codeHash` get, for the same
 * reason: a database leak must not yield a working session.
 *
 * Consumption is a single conditional UPDATE (decyzja D38's pattern, see
 * `consumeOtp`), never a SELECT followed by an UPDATE — two requests racing the
 * same token must produce exactly one session.
 *
 * TTL is minutes, not days: this is a bridge between two requests of the SAME
 * browser session, not a "remember me" mechanism. A sweep column
 * (`expiresAt < now()`) is checked at every consumption attempt instead of a
 * cron job — the same reasoning as D50 for credit expiry: the short TTL already
 * bounds the table's size, so a separate sweep buys nothing but operational
 * overhead.
 */
export const staffSessionHandoff = pgTable(
  "staff_session_handoff",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** SHA-256 of the raw token. The raw value exists only in the redirect URL. */
    tokenHash: text("tokenHash").notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("staff_session_handoff_org_idx").on(t.organizationId),
    index("staff_session_handoff_user_idx").on(t.userId),
  ],
);
