import { lte } from "drizzle-orm";

import type {
  BillingEvent,
  BillingPaymentData,
  BillingSubscriptionData,
} from "@/lib/adapters/billing";
import { db } from "@/lib/db";
import { billingPayment, subscription, webhookEvent } from "@/lib/db/schema";
import { findBillingCustomer } from "./data";
import { planIdForPriceId } from "./plans";

/**
 * Webhook processing (spec 5.4 — idempotent, signed provider events).
 *
 * This is where subscription state is DERIVED — never guessed from a browser
 * redirect (spec 5.3). Not `actions.ts`: a webhook is not a server action, it
 * has no session and no role, and its only authorization is the signature the
 * adapter already verified.
 *
 * Reference pattern for receiving a provider webhook — see docs/ARCHITECTURE.md.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Owner columns copied from `billing_customer`; exactly one is non-null. */
type Owner = { organizationId: string | null; accountId: string | null };

export type ProcessResult =
  | { status: "processed" }
  /** The event was already applied — the redelivery changed nothing. */
  | { status: "duplicate" }
  /** Authentic, but its customer maps to no tenant of ours. */
  | { status: "unknown_customer" };

/**
 * Apply a subscription event as a watermarked upsert.
 *
 * created/updated/canceled collapse into this one path because every
 * subscription event carries the FULL current subscription — so the meaning is
 * always "it looks like this as of `occurredAt`". The `setWhere` guard is what
 * makes that safe under out-of-order delivery: an event older than what we have
 * applied is dropped, so a late `updated` cannot resurrect a cancelled
 * subscription. It also fixes `updated`-before-`created`, which a bare UPDATE
 * would silently no-op.
 *
 * The owner is set on insert only and is deliberately absent from the SET
 * clause: a webhook must never be able to reassign ownership of a record.
 */
async function applySubscriptionEvent(
  tx: Tx,
  event: BillingEvent & { subscription: BillingSubscriptionData },
  customer: { id: string } & Owner,
): Promise<void> {
  const data = event.subscription;
  await tx
    .insert(subscription)
    .values({
      provider: event.provider,
      providerSubscriptionId: data.providerSubscriptionId,
      billingCustomerId: customer.id,
      organizationId: customer.organizationId,
      accountId: customer.accountId,
      providerPriceId: data.providerPriceId,
      planId: planIdForPriceId(data.providerPriceId),
      status: data.status,
      quantity: data.quantity,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      currentPeriodEnd: data.currentPeriodEnd,
      lastEventAt: event.occurredAt,
    })
    .onConflictDoUpdate({
      target: [subscription.provider, subscription.providerSubscriptionId],
      set: {
        providerPriceId: data.providerPriceId,
        planId: planIdForPriceId(data.providerPriceId),
        status: data.status,
        quantity: data.quantity,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        currentPeriodEnd: data.currentPeriodEnd,
        lastEventAt: event.occurredAt,
        updatedAt: new Date(),
      },
      // Drop stale events: only apply what is at least as new as the row.
      // `lte` rather than a raw `sql` template: a value interpolated into `sql`
      // bypasses the column's type encoder and reaches the driver as a raw Date,
      // which it cannot serialize.
      setWhere: lte(subscription.lastEventAt, event.occurredAt),
    });
}

/** Same watermarked upsert for payments — stops a late `invoice.paid` from
 *  overwriting a newer refund. */
async function applyPaymentEvent(
  tx: Tx,
  event: BillingEvent & { payment: BillingPaymentData },
  customer: { id: string } & Owner,
): Promise<void> {
  const data = event.payment;
  await tx
    .insert(billingPayment)
    .values({
      provider: event.provider,
      providerPaymentId: data.providerPaymentId,
      billingCustomerId: customer.id,
      organizationId: customer.organizationId,
      accountId: customer.accountId,
      providerSubscriptionId: data.providerSubscriptionId,
      status: data.status,
      reason: data.reason,
      amount: data.amount,
      currency: data.currency,
      lastEventAt: event.occurredAt,
    })
    .onConflictDoUpdate({
      target: [billingPayment.provider, billingPayment.providerPaymentId],
      set: {
        status: data.status,
        reason: data.reason,
        amount: data.amount,
        currency: data.currency,
        lastEventAt: event.occurredAt,
        updatedAt: new Date(),
      },
      setWhere: lte(billingPayment.lastEventAt, event.occurredAt),
    });
}

/**
 * Process one verified event, exactly once (spec 5.4).
 *
 * The idempotency marker and the state change it authorizes commit in ONE
 * transaction. That single choice buys three properties:
 *   - a redelivery inserts no marker, so it returns early and changes nothing;
 *   - a CONCURRENT redelivery blocks on the unique index until the first
 *     transaction commits, then also finds a conflict and skips;
 *   - if applying the effect throws, the marker rolls back WITH it, so the
 *     provider's retry reprocesses cleanly instead of being permanently
 *     swallowed by a marker for work that never happened.
 *
 * Infrastructure failures are intentionally left to propagate: a 5xx tells the
 * provider to retry, which is exactly right for a transient fault.
 */
export async function processBillingEvent(event: BillingEvent): Promise<ProcessResult> {
  const customer = await findBillingCustomer(event.provider, event.customerId);
  if (!customer) {
    // Permanent, not transient: retrying cannot conjure a mapping. Test-mode
    // provider accounts are shared across laptops, CI and staging, so events for
    // customers that are not ours are normal traffic. Failing here would burn
    // the retry budget and can get the production endpoint disabled. Checkout
    // (spec 5.3) persists the mapping BEFORE creating the session, so a real
    // customer of ours is always resolvable by the time its events arrive.
    // No marker is written, so fixing a mapping + resending still works.
    console.warn(
      `[billing:webhook] ignoring event for unknown customer ` +
        `provider=${event.provider} event=${event.id} type=${event.type} customer=${event.customerId}`,
    );
    return { status: "unknown_customer" };
  }

  return db.transaction(async (tx) => {
    const [marker] = await tx
      .insert(webhookEvent)
      .values({
        provider: event.provider,
        providerEventId: event.id,
        type: event.type,
        organizationId: customer.organizationId,
        accountId: customer.accountId,
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing({
        target: [webhookEvent.provider, webhookEvent.providerEventId],
      })
      .returning({ id: webhookEvent.id });

    if (!marker) return { status: "duplicate" } as const;

    if ("subscription" in event) {
      await applySubscriptionEvent(tx, event, customer);
    } else {
      await applyPaymentEvent(tx, event, customer);
    }
    return { status: "processed" } as const;
  });
}
