import { check, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { organization } from "./organizations";
import { personalAccount } from "./personal-accounts";

/**
 * Webhook event marker (spec 5.4 — idempotent webhook processing).
 *
 * Providers do not guarantee exactly-once delivery, so this table is the dedupe
 * ledger: `unique(provider, providerEventId)` is the constraint the whole
 * idempotency guarantee rests on. Processing inserts the marker with
 * ON CONFLICT DO NOTHING ... RETURNING inside the SAME transaction as the state
 * change it authorizes. Three properties follow:
 *   - a redelivery gets no row back and skips, changing nothing;
 *   - a CONCURRENT redelivery blocks on this unique index until the first
 *     transaction commits, then also skips;
 *   - if processing throws, the marker rolls back with the effect, so the
 *     provider's retry reprocesses cleanly rather than being swallowed.
 *
 * A marker is written ONLY on the processed path — never for an event we
 * ignore. Persisting a marker for an event we could not act on (e.g. an unknown
 * customer) would make a later "Resend" from the provider dashboard hit the
 * marker and skip, permanently losing an otherwise recoverable event.
 *
 * Because the marker is only ever written after the owner has been resolved, it
 * carries the tenant-owner column like every other business table (§1.3/§11.2) —
 * no carve-out needed — which also leaves a per-tenant billing event trail for
 * the admin panel (§6.3).
 *
 * type:       the neutral BillingEventType (never the raw provider string)
 * occurredAt: when the PROVIDER created the event
 * createdAt:  when WE processed it
 */
export const webhookEvent = pgTable(
  "webhook_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    provider: text("provider").notNull(),
    providerEventId: text("providerEventId").notNull(),
    type: text("type").notNull(),
    organizationId: text("organizationId").references(() => organization.id, {
      onDelete: "cascade",
    }),
    accountId: text("accountId").references(() => personalAccount.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("webhook_event_provider_event_uq").on(t.provider, t.providerEventId),
    index("webhook_event_org_idx").on(t.organizationId),
    index("webhook_event_account_idx").on(t.accountId),
    check("webhook_event_owner_ck", sql`(${t.organizationId} IS NULL) <> (${t.accountId} IS NULL)`),
  ],
);
