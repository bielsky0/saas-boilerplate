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
 * "I don't want invitation pings" holds across every org they are in.
 *
 * OUTSIDE RLS, AND THIS IS A DEVIATION RATHER THAN A CLEAN CARVE-OUT (F1a).
 * Measured honestly against the two-part rule in schema/index.ts: the first half
 * HOLDS (the subject is a user setting, not a tenant record — the row spans every
 * org the person belongs to). The second half FAILS: the boundary is a session,
 * which is neither a system credential nor an owner filter. Earlier revisions of
 * this header claimed the carve-out outright; that was too generous.
 *
 * Why the deviation is accepted rather than closed with a third `app.user_id`
 * GUC: `notificationCreateHandler` reads `isInAppSuppressed` and then writes a
 * `notification` as one logical unit. A user GUC makes that either two
 * transactions or a wrapper setting an owner AND a user — reintroducing the
 * "which GUCs are set right now?" ambiguity that makes RLS wrappers get misused.
 * That is a poor trade for a boolean per notification type.
 *
 * What holds the line instead: `userId` is the first parameter of all three
 * accessors in `features/notifications/data.ts` and is always in the predicate;
 * and `e2e/boilerplate-rls.spec.ts` asserts NEGATIVELY that this table has
 * `relrowsecurity = false`. That assertion is the point — enabling RLS here
 * without a user GUC would make every preference invisible and silently stop
 * suppression from working, which is a red test rather than a support ticket.
 *
 * FOLLOW-UP: if `user`/`session`/`account` are ever brought under RLS, they need
 * a user-scoped GUC anyway, and one wrapper then covers all four tables. That is
 * the moment to revisit — not before.
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
