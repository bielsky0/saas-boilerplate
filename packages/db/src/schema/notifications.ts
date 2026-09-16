import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * In-app notification (spec 23.1 — the second delivery channel next to email).
 *
 * One row is one thing a user should see in their bell. It is produced by the
 * `notification.create` job, independently of the `email.send` job for the same
 * business event, so a failed email never suppresses the in-app copy and vice
 * versa (spec 23 — "oba kanały niezależne").
 *
 * RECIPIENT + OWNER: `userId` is who sees it; the XOR owner
 * (`organizationId` / `accountId`) is the active tenant context it belongs to
 * (spec 23.1 — "user w kontekście organizacji"), so the bell shows the right
 * notifications when the user switches context (§3.5). Same two-nullable-columns
 * + XOR CHECK shape as `file` / `billing_customer`. Both owner columns are
 * indexed alongside `userId` — every bell read is `WHERE userId = ? AND owner`.
 *
 * NO TITLE/BODY COLUMNS, on purpose: `type` + `params` are stored, and the bell
 * renders the text via next-intl in the VIEWER's current UI locale (spec 16).
 * Freezing rendered text at create time would pick one language forever and lose
 * the §16 guarantee; a type + params round-trips through jsonb and renders fresh.
 *
 * `link` is the in-app route the item navigates to (e.g. `/invitations/<token>`).
 * `readAt` NULL = unread; it is the unread-count predicate.
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Recipient. Cascade: a user's notifications go when the user is erased (§11.3). */
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    // type: NotificationType (text, validated in app code — no pgEnum, repo convention).
    type: text("type").$type<string>().notNull(),
    /** Render data for the i18n message (amount, orgName, inviterName…). */
    params: jsonb("params").$type<Record<string, string | number>>().notNull().default({}),
    /** In-app route the item opens; nullable for notices with no destination. */
    link: text("link"),
    /** NULL = unread. Set when the recipient reads it. */
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("notification_user_org_idx").on(t.userId, t.organizationId),
    index("notification_user_account_idx").on(t.userId, t.accountId),
    check("notification_owner_ck", sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`),
  ],
);
