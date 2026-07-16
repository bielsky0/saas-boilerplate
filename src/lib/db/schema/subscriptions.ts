import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { billingCustomer } from "./billing-customers";
import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * Subscription (spec 5.4 — provider subscription state, mirrored locally).
 *
 * Every row here is the result of processing a signed, idempotent webhook —
 * never a guess made from a browser redirect (spec 5.3/5.4). The unique
 * `(provider, providerSubscriptionId)` is what the webhook upserts onto.
 *
 * `lastEventAt` is an ordering watermark holding the provider's event
 * timestamp. Providers do not guarantee delivery order, and a retry that lands
 * an hour late IS a stale event — so the upsert only applies when the incoming
 * event is at least as new, otherwise a late `updated` could resurrect a
 * cancelled subscription and hand a churned customer paid access.
 *
 * The owner is DENORMALIZED here rather than only reachable via
 * `billingCustomerId`, because plan-based rendering (spec 5.7) reads by owner on
 * every request and should not join. It cannot drift: it is copied from
 * `billing_customer` inside the same transaction on insert and is NEVER part of
 * the upsert's SET clause, so no webhook can reassign ownership.
 *
 * Organizations are soft-deleted (spec 11.3), so `onDelete: "cascade"` never
 * actually fires — intentionally: the billing record must outlive the tenant for
 * the retention window.
 *
 * status:  provider-neutral union — "active" | "trialing" | "past_due" |
 *          "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused"
 * planId:  the internal plan (see features/billing/plans.ts), or NULL when the
 *          price is not mapped in this environment — fails closed for §5.7.
 */
export const subscription = pgTable(
  "subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    providerSubscriptionId: text("providerSubscriptionId").notNull(),
    billingCustomerId: text("billingCustomerId")
      .notNull()
      .references(() => billingCustomer.id, { onDelete: "cascade" }),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    // Always recorded, even when unmapped, so an unknown plan is diagnosable and
    // self-heals once the price env var is set.
    providerPriceId: text("providerPriceId").notNull(),
    planId: text("planId"),
    status: text("status").notNull(),
    quantity: integer("quantity").notNull().default(1),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    lastEventAt: timestamp("lastEventAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("subscription_provider_subscription_uq").on(t.provider, t.providerSubscriptionId),
    index("subscription_org_idx").on(t.organizationId),
    index("subscription_account_idx").on(t.accountId),
    check("subscription_owner_ck", sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`),
  ],
);
