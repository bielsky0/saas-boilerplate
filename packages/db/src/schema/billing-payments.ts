import { check, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { billingCustomer } from "./billing-customers";
import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * Billing payment (spec 5.4 — renewal / failed payment / refund events).
 *
 * Three of the six webhook events spec 5.4 requires are payment events, and
 * this is their landing zone: without it they would either do nothing or smear
 * onto `subscription`, where a refund has no coherent home. It is also what
 * makes "a redelivered event must not double-charge" literally checkable — two
 * deliveries of one paid invoice leave one row, so SUM(amount) is unchanged.
 *
 * KEYING: each row is keyed on the id of the provider object that produced it —
 * the invoice id for payments, the charge id for refunds — and rows are NEVER
 * merged across those two. Stripe's 2026-06-24 API removed `charge.invoice`
 * (verified in the installed SDK: Charge has no invoice field at all), so tying
 * a refund back to its invoice now requires traversing
 * charge.payment_intent -> invoice.payments, i.e. a live API call from inside
 * the webhook. Keying each row on its own object keeps processing offline and
 * dependency-free; the two rows are correlated by owner + time, not by a join.
 *
 * `lastEventAt` is the same ordering watermark as `subscription` — it stops a
 * late-arriving `invoice.paid` from overwriting a newer refund.
 *
 * status: "paid" | "failed" | "refunded"
 * reason: provider billing reason, e.g. "subscription_cycle" — which is exactly
 *         what distinguishes a RENEWAL from an initial payment (spec 5.4).
 *         NULL for refunds.
 */
export const billingPayment = pgTable(
  "billing_payment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    providerPaymentId: text("providerPaymentId").notNull(),
    billingCustomerId: text("billingCustomerId")
      .notNull()
      .references(() => billingCustomer.id, { onDelete: "cascade" }),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    // Set from the invoice's subscription parent; NULL for refunds and for
    // one-time payments (spec 5.2), which carry no subscription.
    providerSubscriptionId: text("providerSubscriptionId"),
    status: text("status").notNull(),
    reason: text("reason"),
    // Minor units (e.g. cents), exactly as the provider reports them — never a
    // float, so sums stay exact.
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    lastEventAt: timestamp("lastEventAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("billing_payment_provider_payment_uq").on(t.provider, t.providerPaymentId),
    index("billing_payment_org_idx").on(t.organizationId),
    index("billing_payment_account_idx").on(t.accountId),
    check(
      "billing_payment_owner_ck",
      sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`,
    ),
  ],
);
