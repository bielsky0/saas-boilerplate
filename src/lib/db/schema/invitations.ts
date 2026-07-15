import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization } from "./organizations";
import { user } from "./auth";

/**
 * Team invitation (spec 3.3 — single-use, expiring token).
 *
 * The raw token is emailed to the invitee and NEVER stored; only its SHA-256
 * `tokenHash` is persisted (unique), so a database leak cannot yield working
 * links — the same reason auth tokens are hashed. `status` tracks the lifecycle
 * (pending → accepted/revoked/expired) and `expiresAt` bounds validity (default
 * 7 days). Scoped to `organizationId` (indexed tenant key, §11.2).
 *
 * role:   "owner" | "admin" | "member"
 * status: "pending" | "accepted" | "revoked" | "expired"
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    tokenHash: text("tokenHash").notNull().unique(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expiresAt").notNull(),
    invitedByUserId: text("invitedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    acceptedAt: timestamp("acceptedAt"),
  },
  (t) => [
    index("invitation_org_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
  ],
);
