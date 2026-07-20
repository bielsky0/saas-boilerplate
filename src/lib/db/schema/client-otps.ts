import { foreignKey, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { client } from "./clients";
import { organization } from "./organizations";

/**
 * One-time login code for a parent (langlion §2.19 rewizja 14.1, US-4.5).
 *
 * The domain half of the fourth deliberate departure from the boilerplate: staff
 * authenticate through Better Auth, parents through this. A code is scoped to
 * `(organizationId, email)` — the same pair `client` is unique on — so a code
 * issued by Academy A cannot be redeemed at Academy B even when the address is
 * identical. That is the isolation requirement, expressed as a foreign key rather
 * than as a filter someone has to remember.
 *
 * THE RAW CODE IS NEVER STORED, only its SHA-256 — the same treatment
 * `invitation.tokenHash` gets, for the same reason: a database leak must not
 * yield working logins. It follows that verification looks a row up BY hash
 * rather than reading one and comparing.
 *
 * `clientId` is present because the row already exists by the time a code is
 * issued: the registration upsert creates the parent unverified (US-4.1), and the
 * code confirms an identity rather than creating one.
 *
 * ─── `consumedAt` COVERS TWO ENDINGS, DELIBERATELY ──────────────────────────
 *
 * A code stops being usable either because it was redeemed or because a newer one
 * was issued for the same pair. Both write `consumedAt`, and the redemption path
 * cannot tell them apart — which is correct, because the answer it owes the caller
 * is the same in both cases ("this code no longer works"). A second column would
 * split one state into two that behave identically everywhere except in a report
 * nobody has asked for.
 *
 * `attempts` is a DATABASE-BACKED guess counter, and it exists because the rate
 * limiter it sits behind FAILS OPEN by design (see the adapter contract). Losing
 * throttling on a login form still leaves a password underneath; losing it on a
 * six-digit code leaves the whole credential exposed to a loop. So the cap that
 * actually bounds guessing lives on the row, where a store outage cannot lift it.
 */
export const clientOtp = pgTable(
  "client_otp",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("clientId").notNull(),
    /**
     * Denormalised from `client.email` so the lookup key is complete without a
     * join. Verification is keyed on `(organizationId, email, codeHash)`, and that
     * predicate is what makes the consuming UPDATE a single statement.
     */
    email: text("email").notNull(),
    codeHash: text("codeHash").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("client_otp_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.clientId, t.organizationId],
      foreignColumns: [client.id, client.organizationId],
      name: "client_otp_client_fk",
    }).onDelete("cascade"),
    index("client_otp_org_idx").on(t.organizationId),
    /** The verification lookup, and the supersede sweep that precedes an issue. */
    index("client_otp_lookup_idx").on(t.organizationId, t.email),
  ],
);
