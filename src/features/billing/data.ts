import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  billingCustomer,
  billingPayment,
  membership,
  organization,
  personalAccount,
  subscription,
  user,
  webhookEvent,
} from "@/lib/db/schema";

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

/** One subscription by its provider id — the freshness check for notifications. */
export async function getSubscriptionByProviderId(providerSubscriptionId: string) {
  const [row] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.providerSubscriptionId, providerSubscriptionId))
    .limit(1);
  return row ?? null;
}

export interface Mailbox {
  email: string;
  name: string | null;
}

export interface BillingRecipients {
  /** How the owner is named in the email body. */
  ownerName: string;
  /** Present for organizations only — the deep link to their settings. */
  orgSlug: string | null;
  mailboxes: Mailbox[];
}

/**
 * Resolve a billing owner to the people who should hear about it (spec 10.2).
 *
 * An organization resolves to ALL its ACTIVE OWNERS — not the one member who ran
 * checkout. A failed card is an org-level emergency, and the person who paid may
 * well have left the company; mailing only them is how a subscription lapses in
 * silence. A personal account resolves to its user.
 *
 * Like `findBillingCustomer`, this is a documented exception to "scope every read
 * by owner": it CONSUMES an owner id to produce identities, rather than being
 * filtered by one.
 *
 * Soft-deleted users and organizations (spec 11.3) are excluded — nobody there can
 * act on the mail.
 */
export async function resolveBillingRecipients(
  organizationId: string | null,
  accountId: string | null,
): Promise<BillingRecipients> {
  if (organizationId) {
    const rows = await db
      .select({
        email: user.email,
        name: user.name,
        orgName: organization.name,
        orgSlug: organization.slug,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .innerJoin(organization, eq(organization.id, membership.organizationId))
      .where(
        and(
          eq(membership.organizationId, organizationId),
          eq(membership.role, "owner"),
          eq(membership.status, "active"),
          isNull(user.deletedAt),
          isNull(organization.deletedAt),
        ),
      );

    return {
      ownerName: rows[0]?.orgName ?? "your organization",
      orgSlug: rows[0]?.orgSlug ?? null,
      mailboxes: rows.map((r) => ({ email: r.email, name: r.name })),
    };
  }

  if (accountId) {
    const rows = await db
      .select({ email: user.email, name: user.name })
      .from(personalAccount)
      .innerJoin(user, eq(user.id, personalAccount.userId))
      .where(
        and(
          eq(personalAccount.id, accountId),
          isNull(user.deletedAt),
          isNull(personalAccount.deletedAt),
        ),
      );

    return {
      ownerName: rows[0]?.name ?? "your account",
      orgSlug: null,
      mailboxes: rows.map((r) => ({ email: r.email, name: r.name })),
    };
  }

  return { ownerName: "your account", orgSlug: null, mailboxes: [] };
}

/** Processed webhook markers for an organization, newest first (spec 6.3 trail). */
export async function listWebhookEventsForOrganization(organizationId: string) {
  return db
    .select()
    .from(webhookEvent)
    .where(eq(webhookEvent.organizationId, organizationId))
    .orderBy(desc(webhookEvent.createdAt));
}
