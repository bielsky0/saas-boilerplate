import { boolean, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Per-user notification preference (spec 23.3 — the user chooses, per event type,
 * whether to be notified in-app).
 *
 * OPT-OUT LEDGER: the absence of a row means "in-app enabled" (the default), so
 * this table only stores DEVIATIONS from the default — the same shape as
 * `email_suppression`. A row with `inAppEnabled = false` is what actually stops
 * the `notification.create` handler from writing a notification of that type
 * (spec 23 acceptance criterion — "wyłączenie preferencji faktycznie zatrzymuje").
 *
 * KEYED ON userId (not owner): a preference is the person's, not a tenant's —
 * "I don't want invitation pings" holds across every org they are in. This is the
 * §11.2 tenant-isolation carve-out (see schema/index.ts): the subject is a user
 * setting, and its boundary is the session, not an owner filter.
 *
 * SCOPE — IN-APP ONLY (this iteration): the email channel keeps its own
 * category-based opt-out in `features/emails/` (`email_suppression`). Unifying the
 * two into one per-event channel matrix (spec 23.3's full intent) is a deliberate
 * follow-up; governing email from two places at once would be the bug.
 *
 * "transactional"-style CRITICAL types (e.g. a future "new login" security notice,
 * spec 23.3) are unsuppressible by construction in features/notifications/types.ts,
 * so no row here can silence them — `isInAppSuppressed` never consults this table
 * for a non-suppressible type.
 */
export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // type: NotificationType (text, validated in app code — no pgEnum).
    type: text("type").$type<string>().notNull(),
    /** false = the user opted out of the in-app channel for this type. */
    inAppEnabled: boolean("inAppEnabled").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("notification_preference_user_type_uq").on(t.userId, t.type),
    index("notification_preference_user_idx").on(t.userId),
  ],
);
