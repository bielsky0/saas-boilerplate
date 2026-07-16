import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Email opt-out ledger (spec 10.3 — "z respektowaniem tej preferencji przy
 * kolejnych wysyłkach").
 *
 * KEYED ON THE ADDRESS, deliberately, and NOT on userId:
 *   - an unsubscribe link must work with no session: it is clicked from an inbox,
 *     often on a device that never logged in;
 *   - an invitation recipient may have no account at all, and must still be able
 *     to opt out;
 *   - an opt-out must SURVIVE re-registration. A userId-keyed row is destroyed by
 *     the §11.3 purge, silently resurrecting the opt-out — the worst failure of
 *     the three, because it is invisible and it is the one a regulator asks about.
 *
 * TENANT-ISOLATION CARVE-OUT (spec 1.3 / 11.2) — see schema/index.ts. An address
 * is not a tenant record: it may map to no user, and to several tenants at once.
 * Scoping suppression per-organization would mean "unsubscribed from org A's tips
 * but not org B's", which is neither what the link promises nor what CAN-SPAM/GDPR
 * read a global opt-out as. A global opt-out is the point.
 *
 * One row per (email, category), so opting out of onboarding does not silence
 * product notices. `category = "all"` is the sentinel a one-click unsubscribe
 * writes. "transactional" IS NOT A VALUE HERE — it is unsuppressible by
 * construction (see features/emails/categories.ts). A row claiming to suppress a
 * password reset must be unrepresentable, not merely ignored: that email is a
 * lockout, not a preference.
 *
 * category: "onboarding" | "product" | "all"
 * reason:   "unsubscribe" | "bounce" | "complaint" | "admin"
 */
export const emailSuppression = pgTable(
  "email_suppression",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Lowercased by the writer — the KEY of this table. */
    email: text("email").notNull(),
    category: text("category").notNull(),
    reason: text("reason").notNull().default("unsubscribe"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("email_suppression_email_category_uq").on(t.email, t.category),
    index("email_suppression_email_idx").on(t.email),
  ],
);
