import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant, type TenantDb } from "@/lib/db/tenant";
import type { BillingOwner } from "./context";
import type { Locale } from "@/lib/i18n/config";
import { toLocale } from "@/lib/i18n/user-locale";
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
 *
 * Since F1b the four billing tables are under Row-Level Security, so these take a
 * `TenantDb` and the CALLER opens the owner context — the same shape
 * `features/storage/data.ts` and `features/notifications/data.ts` took in F1a.
 * `TenantDb` is deliberately not satisfied by the bare `db` handle, so a call site
 * that forgets the context is a compile error rather than a silently empty result.
 *
 * The one read that cannot name an owner — `findBillingCustomer`, which PRODUCES
 * one from a provider customer id — moved to `./cross-tenant.ts` behind the
 * documented bypass. That is why this module stays absent from the
 * `@/lib/db/system` allow-list in eslint.config.mjs.
 */

/** The owner predicate — an org customer is matched by org id, a personal one by account id. */
function ownerWhere(owner: BillingOwner): SQL {
  return owner.kind === "organization"
    ? eq(billingCustomer.organizationId, owner.organizationId)
    : eq(billingCustomer.accountId, owner.accountId);
}

/** Columns to persist on the owner, spread into an insert. Mirrors the XOR check. */
function ownerColumns(owner: BillingOwner): { organizationId?: string; accountId?: string } {
  return owner.kind === "organization"
    ? { organizationId: owner.organizationId }
    : { accountId: owner.accountId };
}

/**
 * The provider customer mapped to this tenant, or null.
 *
 * The forward direction of `findBillingCustomer` (now in `./cross-tenant.ts`):
 * that one answers "whose event is this?", this one answers "does this tenant
 * already have a customer?" — the question checkout asks before creating a
 * second one.
 */
export async function getBillingCustomerForOwner(
  tx: TenantDb,
  provider: string,
  owner: BillingOwner,
) {
  const [row] = await tx
    .select()
    .from(billingCustomer)
    .where(and(eq(billingCustomer.provider, provider), ownerWhere(owner)))
    .limit(1);
  return row ?? null;
}

/**
 * Persist the provider-customer ↔ tenant mapping.
 *
 * `onConflictDoNothing` on the provider+customer unique index makes this safe to
 * retry, and the follow-up read means two concurrent checkouts converge on one
 * row rather than one of them throwing.
 *
 * Insert and follow-up read share the caller's `tx` since F1b, which incidentally
 * closes the window that existed between them when each took its own connection.
 */
export async function insertBillingCustomer(
  tx: TenantDb,
  provider: string,
  providerCustomerId: string,
  owner: BillingOwner,
) {
  await tx
    .insert(billingCustomer)
    .values({ provider, providerCustomerId, ...ownerColumns(owner) })
    .onConflictDoNothing();
  return getBillingCustomerForOwner(tx, provider, owner);
}

/**
 * Statuses that entitle a tenant to its plan.
 *
 * `past_due` is deliberately included: the provider is still retrying the card
 * and the subscription is not over. Cutting access at the first failed charge
 * punishes an expired card the same as a refusal to pay, and the dunning email
 * (§10.2) is the correct first response. `unpaid`/`canceled` are the end of that
 * road and do NOT appear here.
 */
const ENTITLING_STATUSES = ["active", "trialing", "past_due"];

/** The owner predicate for subscriptions — the same XOR, a different table. */
function subscriptionOwnerWhere(owner: BillingOwner): SQL {
  return owner.kind === "organization"
    ? eq(subscription.organizationId, owner.organizationId)
    : eq(subscription.accountId, owner.accountId);
}

/**
 * The subscription that currently entitles this tenant, or null.
 *
 * Newest-first with a limit of one: a tenant that upgraded mid-cycle can briefly
 * hold two rows, and the most recent is the one that describes what they now
 * have. Feeds both the billing UI and (in §5.7) entitlement checks, so the two
 * cannot disagree about which subscription counts.
 */
export async function getActiveSubscriptionForOwner(tx: TenantDb, owner: BillingOwner) {
  const [row] = await tx
    .select()
    .from(subscription)
    .where(and(subscriptionOwnerWhere(owner), inArray(subscription.status, ENTITLING_STATUSES)))
    .orderBy(desc(subscription.createdAt))
    .limit(1);
  return row ?? null;
}

/** Subscriptions owned by an organization, newest first. */
export async function listSubscriptionsForOrganization(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .orderBy(desc(subscription.createdAt));
}

/** Payments owned by an organization, newest first. */
export async function listPaymentsForOrganization(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId))
    .orderBy(desc(billingPayment.createdAt));
}

/**
 * One subscription by its provider id — the freshness check for notifications.
 *
 * Filtered by provider id alone, but under RLS since F1b the caller's owner
 * context narrows it too, so this can only ever return the caller's own row. That
 * is a strengthening: `notify.ts` carries the owner in its job payload and had no
 * reason to be able to read anyone else's subscription.
 */
export async function getSubscriptionByProviderId(tx: TenantDb, providerSubscriptionId: string) {
  const [row] = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.providerSubscriptionId, providerSubscriptionId))
    .limit(1);
  return row ?? null;
}

export interface Mailbox {
  /** The recipient user — needed to target an in-app notification (spec 23.1). */
  userId: string;
  email: string;
  name: string | null;
  /**
   * What language to write to THIS owner in (spec 16.1).
   *
   * Per-mailbox, not per-organization: an org can have a Polish owner and an
   * English one, and a fan-out that picked one language for the whole org would
   * be wrong for somebody by construction. The joins below already select the
   * user row, so this costs no extra query.
   */
  locale: Locale;
}

export interface BillingRecipients {
  /** How the owner is named in the email body. */
  ownerName: string;
  /**
   * Present for organizations only — the deep link to their settings.
   *
   * SUBDOMAIN, not slug (F4.6): the panel is host-addressed, so a deep link has
   * to name the academy's host rather than a path segment.
   */
  orgSubdomain: string | null;
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
 * Like `findBillingCustomer` (`./cross-tenant.ts`), this is a documented exception
 * to "scope every read by owner": it CONSUMES an owner id to produce identities,
 * rather than being filtered by one. Unlike that one it needs no bypass — it is
 * HANDED the owner, so it scopes itself with `withTenant` below, and it keeps its
 * own transaction rather than taking a `TenantDb`: it is called from a job handler
 * outside any transaction, and threading one in would hold a pooled connection
 * open across the caller's `enqueueEmail`/`enqueueNotification` loop.
 *
 * Soft-deleted users and organizations (spec 11.3) are excluded — nobody there can
 * act on the mail.
 */
export async function resolveBillingRecipients(
  organizationId: string | null,
  accountId: string | null,
): Promise<BillingRecipients> {
  if (organizationId) {
    // Reads `membership`, which is under RLS since F1a — but this function takes
    // the organization id as a PARAMETER, so it can scope itself and needs no
    // bypass. That is why this module is deliberately absent from the
    // `@/lib/db/system` allow-list in eslint.config.mjs.
    const rows = await withTenant(organizationId, (tx) =>
      tx
        .select({
          userId: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          orgName: organization.name,
          orgSubdomain: organization.subdomain,
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
        ),
    );

    return {
      ownerName: rows[0]?.orgName ?? "your organization",
      orgSubdomain: rows[0]?.orgSubdomain ?? null,
      mailboxes: rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        name: r.name,
        locale: toLocale(r.locale),
      })),
    };
  }

  if (accountId) {
    const rows = await db
      .select({ userId: user.id, email: user.email, name: user.name, locale: user.locale })
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
      orgSubdomain: null,
      mailboxes: rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        name: r.name,
        locale: toLocale(r.locale),
      })),
    };
  }

  return { ownerName: "your account", orgSubdomain: null, mailboxes: [] };
}

/** Processed webhook markers for an organization, newest first (spec 6.3 trail). */
export async function listWebhookEventsForOrganization(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(webhookEvent)
    .where(eq(webhookEvent.organizationId, organizationId))
    .orderBy(desc(webhookEvent.createdAt));
}
