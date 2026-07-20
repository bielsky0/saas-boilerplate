import { foreignKey, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { client } from "./clients";
import { organization } from "./organizations";

/**
 * A parent's logged-in session (langlion §2.19, plan F3 / decyzja D37).
 *
 * Separate from Better Auth's `session` table on purpose, and the name collision
 * is exactly why this one is `clientSession` — see the export-uniqueness warning
 * in `./index.ts`, which `class_session` already paid for once.
 *
 * ─── WHY STATE IN THE DATABASE RATHER THAN A SIGNED COOKIE ──────────────────
 *
 * A signed cookie carrying `{clientId, organizationId, exp}` would need no table
 * and no read. It also could not be revoked: "log out everywhere" and "this
 * parent's access ends now" both become "wait for the expiry you already
 * granted". Thirty days is a long time to be unable to say no.
 *
 * The second reason is specific to when this ships. §2.19 rests isolation on a
 * cookie scoped per host, but the subdomain middleware does not exist yet (F5),
 * so today every academy answers on ONE host and cookie scope isolates nothing.
 * With the owner on the row, `organizationId` decides — before the middleware and
 * after it, where host scoping becomes a second, independent layer rather than
 * the thing correctness rests on.
 *
 * The composite foreign key is the same shape `athlete` uses: it targets
 * `client (id, organizationId)`, so a session whose organization disagrees with
 * its client's cannot be written at all. The check that a session belongs to the
 * academy currently being served (`requireClient`) is a separate question, asked
 * per request in `features/client-auth/session.ts`.
 *
 * `lastUsedAt` drives sliding expiry. It is written on a THRESHOLD rather than on
 * every request — a session read happens on every page, and a write per read
 * would turn a lookup into an update and put a session table on the hot write
 * path for no product benefit.
 */
export const clientSession = pgTable(
  "client_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("clientId").notNull(),
    /** SHA-256 of the cookie value. The raw token exists only in the browser. */
    tokenHash: text("tokenHash").notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    lastUsedAt: timestamp("lastUsedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("client_session_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.clientId, t.organizationId],
      foreignColumns: [client.id, client.organizationId],
      name: "client_session_client_fk",
    }).onDelete("cascade"),
    index("client_session_org_idx").on(t.organizationId),
    index("client_session_client_idx").on(t.clientId),
  ],
);
