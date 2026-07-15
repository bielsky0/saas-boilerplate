import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Organization (spec 3.1 — the team/tenant account).
 *
 * The shared-tenant counterpart to a personal account. `slug` is the unique,
 * URL-facing identifier: the active org context is derived from `/orgs/[slug]`
 * (spec 3.5), so it is indexed via its unique constraint. Membership/role live in
 * `membership`; the creator is recorded on `createdByUserId` for audit and is
 * seeded as the first Owner. `deletedAt` supports soft delete + retention (§11.3).
 */
export const organization = pgTable("organization", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdByUserId: text("createdByUserId")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  deletedAt: timestamp("deletedAt"),
});
