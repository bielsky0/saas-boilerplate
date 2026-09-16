import { check, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * Billing customer (spec 5.2 — the provider customer ↔ tenant-owner mapping).
 *
 * Maps a provider-side customer id onto exactly one tenant owner, and is the
 * ONLY way an incoming webhook resolves who an event belongs to (spec 5.4). A
 * plan attaches to an organization OR a personal account (spec 5.2, B2B vs
 * B2C), so both owner columns are nullable with a CHECK enforcing exactly one:
 * `(a IS NULL) <> (b IS NULL)` is a true XOR because `IS NULL` never yields
 * NULL, so the predicate is never NULL (no three-valued-logic hole).
 *
 * INVARIANT FOR CHECKOUT (spec 5.3, when it lands): checkout MUST create the
 * provider customer server-side and persist this mapping BEFORE creating the
 * checkout session. That ordering makes the mapping provably exist before any
 * event can reference it — which is what lets the webhook treat an unresolvable
 * customer as "not ours" and safely ignore it instead of retrying forever.
 */
export const billingCustomer = pgTable(
  "billing_customer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Provider key, e.g. "stripe". Kept alongside the id so two providers can
    // coexist during a migration without colliding (spec 5.1).
    provider: text("provider").notNull(),
    providerCustomerId: text("providerCustomerId").notNull(),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("billing_customer_provider_customer_uq").on(t.provider, t.providerCustomerId),
    index("billing_customer_org_idx").on(t.organizationId),
    index("billing_customer_account_idx").on(t.accountId),
    check(
      "billing_customer_owner_ck",
      sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`,
    ),
  ],
);
