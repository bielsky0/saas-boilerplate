import { boolean, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { organization } from "./organizations";

/**
 * Client — a parent, as a fully domain-owned identity (langlion §1.2 rewizja 14.1,
 * §2.19).
 *
 * THIS IS A DELIBERATE EXCEPTION to "reuse what the boilerplate provides"
 * (Zasada nadrzędna #5) — the fourth of four, alongside the Notification Center,
 * plans-as-data, and Stripe Connect. Parents do NOT get a boilerplate
 * `user`/`membership` row in any form.
 *
 * The reason is a hard business requirement, not a technical preference: from a
 * client's point of view, Academy A and Academy B are unrelated businesses.
 * Hence uniqueness on `(organizationId, email)` rather than globally — the same
 * address at two academies is two unconnected records, and a person who is a
 * client of both has two logins. A shared account would be a smaller schema and
 * the wrong product.
 *
 * Authentication is a domain OTP scoped to `(organizationId, email)`, so a code
 * issued by Academy A is useless at Academy B. Staff continue to use Better Auth
 * unchanged; the two session mechanisms are separate on purpose. The token table
 * and the session design arrive in F3 — this is only the identity row.
 *
 * `isVerified` false means the row was created by the registration upsert before
 * the OTP was confirmed (US-4.1). Recognition that shortcuts the signup form
 * requires `true` AND a match within the same organization (US-4.2/AC1).
 */
export const client = pgTable(
  "client",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    phone: text("phone"),
    name: text("name"),
    isVerified: boolean("isVerified").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("client_id_org_uq").on(t.id, t.organizationId),
    /** The isolation rule itself, as a constraint rather than a convention. */
    unique("client_org_email_uq").on(t.organizationId, t.email),
    index("client_org_idx").on(t.organizationId),
  ],
);
