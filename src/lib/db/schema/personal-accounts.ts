import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Personal account (spec 3.1 — one auto-created workspace per user).
 *
 * Every user owns exactly one personal account, created at registration (see the
 * `databaseHooks.user.create.after` hook in the auth adapter, with an idempotent
 * `ensurePersonalAccount` safety net for pre-existing users). It is the "personal"
 * tenant that business records can be owned by (`account_id`) as the counterpart
 * to `organization_id` — the two owner contexts a user switches between (§1.3, §3.5).
 * Display name/email are read from the linked `user`, so none are duplicated here.
 */
export const personalAccount = pgTable("personal_account", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  // Soft delete (spec 11.3) — retained for the retention window before purge.
  deletedAt: timestamp("deletedAt"),
});
