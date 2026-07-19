import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { organization } from "./organizations";

/**
 * Physical location where classes take place (langlion §1.2, §2.12).
 *
 * Informational rather than structural: a location does not participate in the
 * booking engine, the concurrency guards (§5) or the credit system. Its jobs are
 * to tell parents where to go and to filter the staff schedule. That is exactly
 * why deactivating one only warns instead of blocking, unlike a trainer or a
 * group type (§2.11, decyzja #6 in the spec's §7).
 *
 * `deletedAt` alone carries deactivation; the spec writes it as "is_active /
 * deleted_at", but two columns for one question invites them to disagree, and
 * §11.3's soft-delete column already answers it.
 *
 * The `(id, organizationId)` unique looks redundant next to the primary key and
 * is not: it is the target every composite foreign key in this module points at,
 * which is what makes "a session's location belongs to the session's academy" a
 * structural fact rather than a rule someone has to remember to check.
 */
export const location = pgTable(
  "location",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    deletedAt: timestamp("deletedAt"),
  },
  (t) => [
    unique("location_id_org_uq").on(t.id, t.organizationId),
    index("location_org_idx").on(t.organizationId),
  ],
);
