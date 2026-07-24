import { and, eq, lte } from "drizzle-orm";

import type {
  BillingEvent,
  BillingPaymentData,
  BillingSubscriptionData,
} from "@/lib/adapters/billing";
import { jobs } from "@/lib/adapters/jobs";
import { changed, recordAudit, SYSTEM_ACTOR } from "@/features/admin/audit";
import { withOwner, type Owner, type TenantDb } from "@/lib/db/tenant";
import { billingPayment, organization, plan, subscription, webhookEvent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { findBillingCustomer } from "./cross-tenant";
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
 *
 * ROW-LEVEL SECURITY (F1b). The four billing tables came under RLS, which splits
 * this file in two. RESOLVING the owner cannot be scoped — a provider customer id
 * names no tenant until it is mapped — so `findBillingCustomer` lives in
 * `./cross-tenant.ts` behind the documented bypass, and is the only bypass here.
 * Everything AFTER that runs inside `withOwner`, so `WITH CHECK` stays
 * load-bearing on this path: it is the only externally-driven write path in the
 * application, and the place where a mis-resolved owner would do real damage.
 * That is why this module is deliberately NOT on the `@/lib/db/system`
 * allow-list — see the "WHAT IS DELIBERATELY NOT EXEMPT" list in eslint.config.mjs.
 *
 * THREE `ON CONFLICT` SEMANTICS UNDER RLS, measured rather than assumed, because
 * all three of this file's guarantees depend on them:
 *   - the marker's `DO NOTHING` is evaluated against the INSERT `WITH CHECK`
 *     ONLY; a conflicting row that is invisible under `USING` makes it return no
 *     row exactly as before, so duplicate detection is unchanged;
 *   - `setWhere` is evaluated BEFORE the `USING` check, so a stale event still
 *     returns zero rows without raising — the `applied.length === 0` watermark
 *     signal below means precisely what it always did;
 *   - but a FRESH event whose customer owner disagrees with the owner already
 *     stored on the row now raises `42501` ("the UPDATE path will never be
 *     silently avoided") instead of quietly overwriting another tenant's row with
 *     this one's data. That is the intended trade: loud beats silent. It surfaces
 *     as a 500 and a provider retry, and F1b's data gate is what proves no such
 *     row exists. Note the asymmetry — a STALE event with the same mismatch is
 *     swallowed as stale, so the error is not a reliable detector of the state.
 *
 * The pre-image read in `applySubscriptionEvent` is owner-scoped for free as a
 * result, which is what the §6.4 audit diff should always have been.
 */

/**
 * Owner columns as they sit on `billing_customer`; exactly one is non-null.
 *
 * Distinct from `Owner` in `@/lib/db/tenant`, which is the XOR union the RLS
 * context takes — `ownerOf` converts between them.
 */
type CustomerOwner = { organizationId: string | null; accountId: string | null };

/**
 * The nullable column pair as the XOR union `withOwner` requires.
 *
 * `billing_customer_owner_ck` is what makes the `accountId!` sound: the database
 * refuses a row where both are null or both are set, so a resolved customer
 * always has exactly one.
 */
function ownerOf(customer: CustomerOwner): Owner {
  return customer.organizationId
    ? { kind: "organization", organizationId: customer.organizationId }
    : { kind: "personal", accountId: customer.accountId! };
}

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
  tx: TenantDb,
  event: BillingEvent & { subscription: BillingSubscriptionData },
  customer: { id: string } & CustomerOwner,
): Promise<void> {
  const data = event.subscription;

  // The pre-image, for §6.4's field-level diff. Read with `tx` (we are inside an
  // open transaction — see features/admin/audit.ts) and read BEFORE the upsert,
  // which is the only moment the old values still exist. Undefined on a genuine
  // `created`, which is exactly how we tell the two apart below.
  const [before] = await tx
    .select({
      planId: subscription.planId,
      status: subscription.status,
      quantity: subscription.quantity,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.provider, event.provider),
        eq(subscription.providerSubscriptionId, data.providerSubscriptionId),
      ),
    )
    .limit(1);

  const applied = await tx
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
    })
    .returning({ id: subscription.id });

  /*
   * `.returning()` on an upsert whose `setWhere` failed yields NO ROW. That is a
   * free, exact signal that this event was stale and changed nothing — and it must
   * not be audited, because auditing it would assert a change that the watermark
   * just refused to make.
   */
  if (applied.length === 0) return;

  const after = {
    planId: planIdForPriceId(data.providerPriceId),
    status: data.status,
    quantity: data.quantity,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
  };
  // A `created` has no pre-image, so every field is a change. An `updated` that
  // altered nothing (the monthly renewal — same plan, same status, same seats)
  // yields `undefined` from `changed()` and is skipped. Logging those would add a
  // row per subscriber per month saying nothing happened, which is how an audit
  // log becomes something people filter out rather than read.
  const changes = before
    ? changed(before, after, Object.keys(after) as (keyof typeof after)[])
    : undefined;
  if (before && !changes) return;

  await recordAudit(tx, {
    action: "subscription.change",
    actor: SYSTEM_ACTOR,
    organizationId: customer.organizationId,
    targetType: "subscription",
    targetId: data.providerSubscriptionId,
    targetLabel: after.planId ?? data.providerPriceId,
    metadata: {
      changes,
      eventType: event.type,
      // The webhook route IS a request scope, so recordAudit's headers() capture
      // succeeds — and captures the PROVIDER's IP and user-agent, not a user's.
      // Naming the source here stops the next reader from misreading those columns
      // as evidence about a person.
      source: "webhook",
      providerEventId: event.id,
    },
  });

  // F9: Update organization.plan_id when plan changes (idempotent via webhook watermark)
  if (customer.organizationId && before?.planId !== after.planId) {
    const newPlanCode = after.planId;
    if (newPlanCode) {
      const [planRow] = await tx
        .select({ id: plan.id })
        .from(plan)
        .where(eq(plan.code, newPlanCode))
        .limit(1);
      if (planRow) {
        await tx
          .update(organization)
          .set({ planId: planRow.id, updatedAt: new Date() })
          .where(eq(organization.id, customer.organizationId));
      }
    }
  }
}

/** Same watermarked upsert for payments — stops a late `invoice.paid` from
 *  overwriting a newer refund. */
async function applyPaymentEvent(
  tx: TenantDb,
  event: BillingEvent & { payment: BillingPaymentData },
  customer: { id: string } & CustomerOwner,
): Promise<void> {
  const data = event.payment;
  const applied = await tx
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
    })
    .returning({ id: billingPayment.id });

  // Same stale-event signal as the subscription path above.
  if (applied.length === 0) return;

  /*
   * No `changed()` diff here, unlike subscriptions, and the asymmetry is
   * deliberate. A payment is an EVENT, not a mutable record — "succeeded" and
   * "refunded" arrive as separate provider events about separate facts, so its
   * status transitions are the thing worth recording, not a field-level diff
   * against a previous shape. `metadata` carries the amount, which is what an
   * auditor actually reconciles against.
   */
  await recordAudit(tx, {
    action: "payment.record",
    actor: SYSTEM_ACTOR,
    organizationId: customer.organizationId,
    targetType: "payment",
    targetId: data.providerPaymentId,
    targetLabel: `${(data.amount / 100).toFixed(2)} ${data.currency.toUpperCase()}`,
    metadata: {
      status: data.status,
      reason: data.reason,
      amount: data.amount,
      currency: data.currency,
      eventType: event.type,
      source: "webhook",
      providerEventId: event.id,
    },
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
 *
 * NOTIFICATIONS (spec 10.2) ARE ENQUEUED INSIDE THIS TRANSACTION, and the enqueue
 * is a plain INSERT precisely so that it can be. Sending mail here instead would
 * break in three ways, none of them obvious:
 *   - it is not transactional. If the send succeeds and the transaction THEN rolls
 *     back, the marker rolls back with it, the provider retries, the marker
 *     inserts — and the mail goes out twice. Rare and unreproducible, which is
 *     worse than common;
 *   - it holds a pooled connection open across an HTTP call to the email provider.
 *     That is the deadlock features/admin/audit.ts documents, with an outage as
 *     the trigger: on the small default pool, a provider timing out plus a webhook
 *     burst wedges the whole app;
 *   - it makes webhook latency depend on the email provider. Stripe times out
 *     around 20s and retries, so a slow provider MANUFACTURES the redeliveries
 *     that then hit the first problem.
 * The enqueue has none of these and inherits the marker's exactly-once guarantee
 * for free. The drain happens after the response, from the route.
 */
const log = createLogger("billing:webhook");

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
    log.warn("ignoring event for unknown customer", {
      provider: event.provider,
      event: event.id,
      type: event.type,
      customer: event.customerId,
    });
    return { status: "unknown_customer" };
  }

  // Every write below runs in the resolved owner's context, so `WITH CHECK` is
  // the last line of defence against a mis-resolved owner rather than a
  // decoration. The resolve above is the one thing that could not be scoped.
  return withOwner(ownerOf(customer), async (tx) => {
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
      await enqueueSubscriptionNotification(tx, event, customer);
    } else {
      await applyPaymentEvent(tx, event, customer);
      await enqueuePaymentNotification(tx, event, customer);
    }
    return { status: "processed" } as const;
  });
}

/**
 * Announce a NEW subscription (spec 10.2) — never an update.
 *
 * `applySubscriptionEvent` collapses created/updated/canceled into one upsert
 * because they all carry the full subscription; notifications must not. Firing on
 * `updated` would mail a receipt on every renewal, quantity change and card swap.
 */
async function enqueueSubscriptionNotification(
  tx: TenantDb,
  event: BillingEvent & { subscription: BillingSubscriptionData },
  customer: CustomerOwner,
): Promise<void> {
  if (event.type !== "subscription.created") return;
  await jobs.enqueue(
    tx,
    "billing.notify",
    {
      kind: "subscription-confirmed",
      organizationId: customer.organizationId,
      accountId: customer.accountId,
      eventId: event.id,
      providerSubscriptionId: event.subscription.providerSubscriptionId,
    },
    { dedupeKey: `billing:subscription-confirmed:${event.provider}:${event.id}` },
  );
}

/** Dunning notice for a failed charge (spec 10.2). */
async function enqueuePaymentNotification(
  tx: TenantDb,
  event: BillingEvent & { payment: BillingPaymentData },
  customer: CustomerOwner,
): Promise<void> {
  if (event.payment.status !== "failed") return;
  await jobs.enqueue(
    tx,
    "billing.notify",
    {
      kind: "payment-failed",
      organizationId: customer.organizationId,
      accountId: customer.accountId,
      eventId: event.id,
      amount: event.payment.amount,
      currency: event.payment.currency,
    },
    // Keyed on the provider EVENT id, not the payment id: the marker above already
    // guarantees one enqueue per event, so this is belt-and-braces — and it earns
    // its keep the day someone moves this enqueue out of the transaction, when it
    // becomes the only thing still holding the line.
    { dedupeKey: `billing:payment-failed:${event.provider}:${event.id}` },
  );
}
