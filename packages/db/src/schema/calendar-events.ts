import { check, index, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * Calendar event (etap 5, faza 5.3).
 *
 * Owner is organization XOR personal account (the §1.3 tenant rule, same as
 * billing/storage rows). Times are ALWAYS UTC (`timestamptz`) — the org's
 * `timezone` column names the DISPLAY zone only, and rendering converts at
 * read time in the frontend. No recurrence rules in v1: repeat is a product
 * decision for later; single instances keep overlap math honest.
 *
 * kind: free-form event category (`family|business|personal|holiday|etc`
 * from the AdminCN template, but never validated against that list — a
 * closed enum here would reject tomorrow's categories at the database).
 */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    createdByUserId: text("createdByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("startsAt", { withTimezone: true }).notNull(),
    endsAt: timestamp("endsAt", { withTimezone: true }).notNull(),
    allDay: boolean("allDay").notNull().default(false),
    kind: text("kind").notNull().default("etc"),
    location: text("location"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("calendar_event_org_idx").on(t.organizationId, t.startsAt),
    index("calendar_event_account_idx").on(t.accountId, t.startsAt),
    check(
      "calendar_event_owner_ck",
      sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`,
    ),
    check("calendar_event_range_ck", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
