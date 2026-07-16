import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { billingCustomer, billingPayment, subscription, webhookEvent } from "@/lib/db/schema";

/**
 * Billing data-access layer (spec 1.3 / 11.2 — tenant-scoped queries).
 *
 * Every read here is scoped by the tenant owner, so isolation is enforced in the
 * data layer rather than the UI. Feature code calls these helpers and never
 * writes ad-hoc queries; the webhook's writes live in `./webhooks.ts` because
 * they must share one transaction with the idempotency marker.
 */

/**
 * Resolve a provider customer id to its tenant owner. This is the ONE place a
 * webhook learns who an event belongs to (spec 5.4), and the documented
 * exception to "scope every query by owner" — like `getOrgBySlug`, it is the
 * lookup that PRODUCES the owner rather than consuming it.
 */
export async function findBillingCustomer(provider: string, providerCustomerId: string) {
  const [row] = await db
    .select()
    .from(billingCustomer)
    .where(
      and(
        eq(billingCustomer.provider, provider),
        eq(billingCustomer.providerCustomerId, providerCustomerId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Subscriptions owned by an organization, newest first. */
export async function listSubscriptionsForOrganization(organizationId: string) {
  return db
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .orderBy(desc(subscription.createdAt));
}

/** Payments owned by an organization, newest first. */
export async function listPaymentsForOrganization(organizationId: string) {
  return db
    .select()
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId))
    .orderBy(desc(billingPayment.createdAt));
}

/** Processed webhook markers for an organization, newest first (spec 6.3 trail). */
export async function listWebhookEventsForOrganization(organizationId: string) {
  return db
    .select()
    .from(webhookEvent)
    .where(eq(webhookEvent.organizationId, organizationId))
    .orderBy(desc(webhookEvent.createdAt));
}
