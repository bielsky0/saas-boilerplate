import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { organization } from "./organizations";
import { user } from "./auth";

/**
 * Membership (spec 3.1 — user ↔ organization ↔ role, with status).
 *
 * The join table that makes an organization multi-tenant. `role` and `status` are
 * stored as plain text validated by the app (the role→permission map in
 * `features/rbac` is the single source of truth — spec 4.1); keeping them as text
 * avoids a migration when roles evolve. `organizationId` is the tenant-owner key
 * every org query is scoped by (§1.3/§11.2) and is indexed; `(organizationId,
 * userId)` is unique so a user cannot hold two memberships in one org.
 *
 * role:   "owner" | "admin" | "member"
 * status: "active" | "invited" | "suspended"
 */
export const membership = pgTable(
  "membership",
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
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("membership_org_user_uq").on(t.organizationId, t.userId),
    index("membership_org_idx").on(t.organizationId),
    index("membership_user_idx").on(t.userId),
  ],
);
