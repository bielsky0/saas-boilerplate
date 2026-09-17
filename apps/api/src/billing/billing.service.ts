import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import {
  ENTITLING_STATUSES,
  PLAN_IDS,
  createCatalog,
  type BillingCatalog,
  type Plan,
} from "@repo/billing";
import type {
  BillingEvent,
  BillingOperationErrorCode,
  BillingPaymentData,
  BillingSubscriptionData,
} from "@repo/contracts";
import {
  billingCustomer,
  billingPayment,
  personalAccount,
  subscription,
  user,
  webhookEvent,
  type Db,
} from "@repo/db";
import { optionalSlugParam } from "@repo/validation";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { badRequest, validationFailed } from "../common/http";
import type { RequestSession } from "../auth/auth-engine";
import { changed, recordAudit, SYSTEM_ACTOR } from "../organizations/audit";
import { getOrCreatePersonalAccount, getOrgBySlug, requireOrgMember } from "../tenancy/access";
import { insertJob, type QueueWriter } from "../jobs/queue";
import { BILLING_ADAPTER } from "./adapter";
import type { BillingAdapter } from "@repo/contracts";

/**
 * Billing flows (spec 5 — plans, checkout, portal, webhooks).
 *
 * The Nest twin of the web app's `features/billing/{checkout,context,data,
 * webhooks}.ts` + the dev seams from `app/api/dev/{billing-state,
 * seed-billing-customer}`. Same rules, in the same order:
 * - validation first (spec 22.2, English backstops — the client pre-validates,
 *   so these messages only surface on hand-built requests), tenant + RBAC
 *   second via `tenancy/access` (`billing.manage`, owner-only);
 * - the provider customer mapping is PERSISTED before any checkout session
 *   exists (the ordering invariant from `schema/billing-customers.ts`): that
 *   is what lets the webhook treat an unresolvable customer as "not ours" and
 *   ignore it, instead of retrying forever against a row that never existed;
 * - the webhook is the source of truth for subscription state (spec 5.4) —
 *   nothing on the success path grants access. The redirect confirms, the
 *   webhook entitles.
 *
 * Throws `HttpException`s with the envelope (`{ error, issues? }`).
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Server-side English backstops (spec 22.2): rules mirror the client schemas. */
const checkoutBodySchema = z.object({
  slug: optionalSlugParam,
  plan: z.enum(PLAN_IDS),
});

const portalBodySchema = z.object({
  slug: optionalSlugParam,
});

const subscriptionQuerySchema = z.object({
  slug: optionalSlugParam,
});

const seedBillingCustomerSchema = z.object({
  providerCustomerId: z.string().min(1),
  provider: z.string().min(1).default("stripe"),
  orgSlug: z.string().min(1).optional(),
  userEmail: z.string().min(1).optional(),
});

/** Which tenant a billing request acts as (spec 5.2 → 1.3, B2B vs B2C). */
export type BillingOwner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

export interface ResolvedBillingOwner {
  owner: BillingOwner;
  userId: string;
  /** Who to name on the provider customer record. */
  email: string;
  name: string | null;
  /** Present for organizations only — used to build return URLs. */
  orgSlug: string | null;
}

export type ProcessResult =
  | { status: "processed" }
  /** The event was already applied — the redelivery changed nothing. */
  | { status: "duplicate" }
  /** Authentic, but its customer maps to no tenant of ours. */
  | { status: "unknown_customer" };

export interface SubscriptionView {
  planId: string | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Owner columns copied from `billing_customer`; exactly one is non-null. */
type Owner = { organizationId: string | null; accountId: string | null };

@Injectable()
export class BillingService {
  private readonly log = new Logger("BillingService");
  private readonly catalog: BillingCatalog;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(BILLING_ADAPTER) private readonly billing: BillingAdapter,
  ) {
    this.catalog = createCatalog({
      pro: config.STRIPE_PRICE_PRO ?? null,
      business: config.STRIPE_PRICE_BUSINESS ?? null,
    });
  }

  private orgsEnabled(): boolean {
    return this.config.MULTI_TENANCY_MODE !== "disabled";
  }

  private webURL(): string {
    return this.config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  /** Where the provider sends the browser back to, per tenant context. */
  private returnPath(orgSlug: string | null): string {
    return orgSlug ? `/orgs/${orgSlug}/settings/billing` : "/settings/billing";
  }

  /**
   * Resolve which tenant a billing request acts as.
   *
   * Org-scoped when it carries a `slug` (through the shared RBAC chokepoint —
   * paying is authorized like every other org action, §4.2), personal-scoped
   * otherwise. A plan attaches to an organization OR a personal account (spec
   * 5.2), which is exactly the XOR `billing_customer` enforces in the schema.
   */
  async resolveBillingOwner(
    slug: string | null,
    session: RequestSession,
  ): Promise<ResolvedBillingOwner> {
    if (slug) {
      const { org } = await requireOrgMember(
        this.db,
        session,
        slug,
        this.orgsEnabled(),
        "billing.manage",
      );
      return {
        owner: { kind: "organization", organizationId: org.id },
        userId: session.user.id,
        email: session.user.email,
        name: org.name,
        orgSlug: org.slug,
      };
    }

    const account = await getOrCreatePersonalAccount(this.db, session.user.id);
    const [row] = await this.db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);
    return {
      owner: { kind: "personal", accountId: account.id },
      userId: session.user.id,
      email: session.user.email,
      // The session carries no name (see `RequestSession`) — one query for it.
      name: row?.name ?? null,
      orgSlug: null,
    };
  }

  /** The owner predicate — an org customer is matched by org id, a personal one by account id. */
  private ownerWhere(owner: BillingOwner) {
    return owner.kind === "organization"
      ? eq(billingCustomer.organizationId, owner.organizationId)
      : eq(billingCustomer.accountId, owner.accountId);
  }

  /**
   * Resolve a provider customer id to its tenant owner. This is the ONE place a
   * webhook learns who an event belongs to (spec 5.4), and the documented
   * exception to "scope every query by owner" — it is the lookup that PRODUCES
   * the owner rather than consuming it.
   */
  async findBillingCustomer(provider: string, providerCustomerId: string) {
    const [row] = await this.db
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

  /** The provider customer mapped to this tenant, or null. */
  private async getBillingCustomerForOwner(provider: string, owner: BillingOwner) {
    const [row] = await this.db
      .select()
      .from(billingCustomer)
      .where(and(eq(billingCustomer.provider, provider), this.ownerWhere(owner)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find or create the provider customer for a tenant, persisting the mapping.
   *
   * Idempotent: an existing mapping short-circuits, so a user who abandons
   * checkout and returns does not accumulate duplicate provider customers.
   */
  private async ensureBillingCustomer(
    owner: BillingOwner,
    email: string,
    name: string | null,
  ): Promise<
    { ok: true; providerCustomerId: string } | { ok: false; code: BillingOperationErrorCode }
  > {
    const existing = await this.getBillingCustomerForOwner(this.billing.provider, owner);
    if (existing) return { ok: true, providerCustomerId: existing.providerCustomerId };

    const created = await this.billing.createCustomer({
      email,
      name,
      // Mirrored for support/reconciliation only — never read back as an
      // authorization input (provider metadata is mutable from their UI).
      metadata:
        owner.kind === "organization"
          ? { organizationId: owner.organizationId }
          : { accountId: owner.accountId },
    });
    if (!created.ok) return created;

    // Persist BEFORE any checkout session exists (the ordering invariant): the
    // follow-up read makes two concurrent checkouts converge on one row.
    await this.db
      .insert(billingCustomer)
      .values({
        provider: this.billing.provider,
        providerCustomerId: created.providerCustomerId,
        ...(owner.kind === "organization"
          ? { organizationId: owner.organizationId }
          : { accountId: owner.accountId }),
      })
      .onConflictDoNothing();
    const persisted = await this.getBillingCustomerForOwner(this.billing.provider, owner);
    // Unreachable in practice (the insert just wrote it) — but a missing mapping
    // here would send checkout after a customer that cannot be webhooked back.
    if (!persisted) throw new Error("billing customer mapping missing after insert");
    return { ok: true, providerCustomerId: persisted.providerCustomerId };
  }

  /**
   * Start a hosted checkout for `plan`, returning the URL to redirect to.
   *
   * WHAT THIS DELIBERATELY DOES NOT DO: grant access. The success redirect only
   * brings the browser back; entitlement follows from the webhook (spec 5.3 —
   * the user can close the tab before ever being redirected). Nothing here
   * writes a subscription row.
   */
  async startCheckout(ctx: ResolvedBillingOwner, plan: Plan & { priceId: string }) {
    const customer = await this.ensureBillingCustomer(ctx.owner, ctx.email, ctx.name);
    if (!customer.ok) return customer;

    const back = this.returnPath(ctx.orgSlug);
    return this.billing.createCheckoutSession({
      providerCustomerId: customer.providerCustomerId,
      providerPriceId: plan.priceId,
      // Seats are synced from the provider via webhooks; checkout starts at one.
      quantity: 1,
      mode: plan.mode,
      successUrl: `${this.webURL()}${back}?checkout=success`,
      cancelUrl: `${this.webURL()}${back}?checkout=canceled`,
    });
  }

  /**
   * Open the provider's customer portal (spec 5.5).
   *
   * A tenant that has never checked out has no provider customer; rather than
   * creating one just to show an empty portal, that is reported as
   * `NO_CUSTOMER` so the route can 404 and the UI can hide the link.
   */
  async openBillingPortal(
    ctx: ResolvedBillingOwner,
  ): Promise<
    { ok: true; url: string } | { ok: false; code: BillingOperationErrorCode | "NO_CUSTOMER" }
  > {
    const existing = await this.getBillingCustomerForOwner(this.billing.provider, ctx.owner);
    if (!existing) return { ok: false, code: "NO_CUSTOMER" };

    return this.billing.createPortalSession({
      providerCustomerId: existing.providerCustomerId,
      returnUrl: `${this.webURL()}${this.returnPath(ctx.orgSlug)}`,
    });
  }

  /** Checkout endpoint: validate → resolve owner → purchasability → provider. */
  async checkout(
    session: RequestSession,
    body: unknown,
  ): Promise<{ url: string } | { code: "NOT_PURCHASABLE" | "NOT_CONFIGURED" | "PROVIDER_ERROR" }> {
    const parsed = checkoutBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error, "Invalid checkout request");

    // A configured-but-unpriced plan (and the free plan, which has no price id
    // by construction) is not purchasable — 404 rather than 422: the request is
    // well-formed, the resource just does not exist in this environment.
    const plan = this.catalog.purchasablePlan(parsed.data.plan);
    if (!plan) return { code: "NOT_PURCHASABLE" };

    const ctx = await this.resolveBillingOwner(parsed.data.slug ?? null, session);
    const result = await this.startCheckout(ctx, plan);

    if (result.ok) return { url: result.url };
    if (result.code === "NOT_CONFIGURED") return { code: "NOT_CONFIGURED" };
    return { code: "PROVIDER_ERROR" };
  }

  /** Portal endpoint: validate → resolve owner → portal (or 404 when never checked out). */
  async portal(
    session: RequestSession,
    body: unknown,
  ): Promise<{ url: string } | { code: "NO_CUSTOMER" | "NOT_CONFIGURED" | "PROVIDER_ERROR" }> {
    const parsed = portalBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error, "Invalid portal request");

    const ctx = await this.resolveBillingOwner(parsed.data.slug ?? null, session);
    const result = await this.openBillingPortal(ctx);

    if (result.ok) return { url: result.url };
    if (result.code === "NO_CUSTOMER" || result.code === "NOT_CONFIGURED") {
      return { code: result.code };
    }
    return { code: "PROVIDER_ERROR" };
  }

  /**
   * The subscription that currently entitles this tenant, or null.
   *
   * Newest-first with a limit of one: a tenant that upgraded mid-cycle can
   * briefly hold two rows, and the most recent is the one that describes what
   * they now have. Feeds both the billing UI and (§5.7) entitlement checks, so
   * the two cannot disagree about which subscription counts.
   */
  async getActiveSubscriptionForOwner(owner: BillingOwner) {
    const [row] = await this.db
      .select()
      .from(subscription)
      .where(
        and(
          owner.kind === "organization"
            ? eq(subscription.organizationId, owner.organizationId)
            : eq(subscription.accountId, owner.accountId),
          inArray(subscription.status, [...ENTITLING_STATUSES]),
        ),
      )
      .orderBy(desc(subscription.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Read endpoint for the billing panel: membership-checked, never the provider. */
  async subscriptionView(
    session: RequestSession,
    query: unknown,
  ): Promise<{ subscription: SubscriptionView | null }> {
    const parsed = subscriptionQuerySchema.safeParse(query);
    if (!parsed.success) validationFailed(parsed.error, "Invalid subscription query");

    // Reads need membership only (same rule as storage/file reads) — the settings
    // page already gates on `billing.manage`; the API re-checks nothing beyond.
    const slug = parsed.data.slug ?? null;
    const owner: BillingOwner = slug
      ? {
          kind: "organization",
          organizationId: (await requireOrgMember(this.db, session, slug, this.orgsEnabled())).org
            .id,
        }
      : {
          kind: "personal",
          accountId: (await getOrCreatePersonalAccount(this.db, session.user.id)).id,
        };

    const active = await this.getActiveSubscriptionForOwner(owner);
    if (!active) return { subscription: null };
    return {
      subscription: {
        planId: active.planId,
        status: active.status,
        currentPeriodEnd: active.currentPeriodEnd ? active.currentPeriodEnd.toISOString() : null,
        cancelAtPeriodEnd: active.cancelAtPeriodEnd,
      },
    };
  }

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
  private async applySubscriptionEvent(
    tx: Tx,
    event: BillingEvent & { subscription: BillingSubscriptionData },
    customer: { id: string } & Owner,
  ): Promise<void> {
    const data = event.subscription;

    // The pre-image, for §6.4's field-level diff. Read with `tx` (we are inside
    // an open transaction) and read BEFORE the upsert, which is the only moment
    // the old values still exist. Undefined on a genuine `created`, which is
    // exactly how we tell the two apart below.
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
        planId: this.catalog.planIdForPriceId(data.providerPriceId),
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
          planId: this.catalog.planIdForPriceId(data.providerPriceId),
          status: data.status,
          quantity: data.quantity,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
          currentPeriodEnd: data.currentPeriodEnd,
          lastEventAt: event.occurredAt,
          updatedAt: new Date(),
        },
        // Drop stale events: only apply what is at least as new as the row.
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
      planId: this.catalog.planIdForPriceId(data.providerPriceId),
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
        // The webhook route IS a request scope, so the audit columns capture the
        // PROVIDER's IP and user-agent, not a user's. Naming the source here
        // stops the next reader from misreading those columns as evidence about
        // a person.
        source: "webhook",
        providerEventId: event.id,
      },
    });
  }

  /** Same watermarked upsert for payments — stops a late `invoice.paid` from
   *  overwriting a newer refund. */
  private async applyPaymentEvent(
    tx: Tx,
    event: BillingEvent & { payment: BillingPaymentData },
    customer: { id: string } & Owner,
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
   * Billing webhook endpoint (spec 5.4 — the source of truth for subscriptions).
   *
   * Deliberately UNAUTHENTICATED: the provider has no session, so the request
   * SIGNATURE is the authentication. The body MUST be the raw bytes (`rawBody`,
   * never a re-serialized object): the signature covers the exact bytes sent.
   *
   * Responses are chosen by whether a retry could ever help, since the provider
   * retries on ANY non-2xx:
   *   400 bad signature / unparseable payload — not actionable, or a bug to fix
   *   404 no provider configured — this deployment has no billing endpoint
   *   200 accepted, duplicate, ignored, or not our customer — all final
   *   5xx (uncaught) infrastructure failure — retry is exactly right
   */
  async webhook(
    rawBody: string | undefined,
    signature: string | undefined,
  ): Promise<
    | { outcome: "not_configured" }
    | { outcome: "malformed" }
    | { outcome: "invalid_signature" }
    | { outcome: "ignored" }
    | { outcome: "processed" | "duplicate" | "unknown_customer" }
  > {
    if (!rawBody) {
      // The Express `rawBody` buffer never arrived — a deployment misconfiguration,
      // not a provider fault. Answered as a bad signature (no retry), and logged
      // as an error because it needs an operator, not the provider.
      this.log.error("webhook without raw body — check rawBody configuration");
      return { outcome: "invalid_signature" };
    }
    const headers = new Headers();
    if (signature) headers.set("stripe-signature", signature);
    const result = await this.billing.verifyWebhook(rawBody, headers);

    if (!result.ok) {
      if (result.code === "NOT_CONFIGURED") return { outcome: "not_configured" };
      if (result.code === "MALFORMED_PAYLOAD") {
        // Authentic but unrecognizable — usually provider API-version skew.
        // Retries give us a window to deploy a fix and have them redelivered.
        this.log.error("rejected malformed payload");
        return { outcome: "malformed" };
      }
      return { outcome: "invalid_signature" };
    }

    if (result.status === "ignored") {
      // Most provider traffic. Never touches state, so no marker is written.
      return { outcome: "ignored" };
    }

    // Infrastructure errors propagate to a 500 on purpose (see header).
    const processed = await this.processBillingEvent(result.event);
    return { outcome: processed.status };
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
   * double-send on the rollback path, hold a pooled connection across an HTTP call
   * (deadlock — see `features/admin/audit.ts` in web), and make webhook latency
   * depend on the email provider. The enqueue inherits the marker's exactly-once
   * guarantee for free. The drain happens after the response, from the controller.
   */
  async processBillingEvent(event: BillingEvent): Promise<ProcessResult> {
    const customer = await this.findBillingCustomer(event.provider, event.customerId);
    if (!customer) {
      // Permanent, not transient: retrying cannot conjure a mapping. Test-mode
      // provider accounts are shared across laptops, CI and staging, so events for
      // customers that are not ours are normal traffic. Failing here would burn
      // the retry budget and can get the production endpoint disabled. Checkout
      // (spec 5.3) persists the mapping BEFORE creating the session, so a real
      // customer of ours is always resolvable by the time its events arrive.
      // No marker is written, so fixing a mapping + resending still works.
      this.log.warn(
        `ignoring event for unknown customer provider=${event.provider} event=${event.id} type=${event.type} customer=${event.customerId}`,
      );
      return { status: "unknown_customer" };
    }

    return this.db.transaction(async (tx) => {
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
        await this.applySubscriptionEvent(tx, event, customer);
        await this.enqueueSubscriptionNotification(tx, event, customer);
      } else {
        await this.applyPaymentEvent(tx, event, customer);
        await this.enqueuePaymentNotification(tx, event, customer);
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
  private async enqueueSubscriptionNotification(
    tx: Tx,
    event: BillingEvent & { subscription: BillingSubscriptionData },
    customer: Owner,
  ): Promise<void> {
    if (event.type !== "subscription.created") return;
    await this.enqueueBillingNotify(
      tx,
      {
        kind: "subscription-confirmed",
        organizationId: customer.organizationId,
        accountId: customer.accountId,
        eventId: event.id,
        providerSubscriptionId: event.subscription.providerSubscriptionId,
      },
      `billing:subscription-confirmed:${event.provider}:${event.id}`,
    );
  }

  /** Dunning notice for a failed charge (spec 10.2). */
  private async enqueuePaymentNotification(
    tx: Tx,
    event: BillingEvent & { payment: BillingPaymentData },
    customer: Owner,
  ): Promise<void> {
    if (event.payment.status !== "failed") return;
    await this.enqueueBillingNotify(
      tx,
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
      `billing:payment-failed:${event.provider}:${event.id}`,
    );
  }

  private async enqueueBillingNotify(
    writer: QueueWriter,
    payload: Record<string, unknown>,
    dedupeKey: string,
  ): Promise<void> {
    await insertJob(writer, "billing.notify", payload, { dedupeKey });
  }

  /**
   * Test-only billing state inspector (spec 14.1). Lets E2E tests assert what a
   * webhook actually wrote to the database — the in-process counterpart to the
   * email outbox. Served through the dev controller (404 in production).
   */
  async getBillingState(orgSlug: string) {
    const org = await getOrgBySlug(this.db, orgSlug);
    if (!org) badRequest(`org ${orgSlug} not found`);
    const organizationId = org.id;
    const [subscriptions, payments, webhookEvents] = await Promise.all([
      this.db
        .select()
        .from(subscription)
        .where(eq(subscription.organizationId, organizationId))
        .orderBy(desc(subscription.createdAt)),
      this.db
        .select()
        .from(billingPayment)
        .where(eq(billingPayment.organizationId, organizationId))
        .orderBy(desc(billingPayment.createdAt)),
      this.db
        .select()
        .from(webhookEvent)
        .where(eq(webhookEvent.organizationId, organizationId))
        .orderBy(desc(webhookEvent.createdAt)),
    ]);

    return {
      subscriptions,
      payments,
      webhookEvents,
      // Summed here so a test can assert "no double charge" directly.
      totalPaid: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
    };
  }

  /**
   * Test-only billing customer seeder (spec 14.1). Maps a provider customer id
   * onto a tenant owner so webhook E2E tests have a resolvable customer without
   * running checkout (spec 5.3). Served through the dev controller (404 in
   * production). Exactly one of orgSlug / userEmail must be given — mirroring
   * the XOR the `billing_customer_owner_ck` constraint enforces.
   */
  async seedBillingCustomer(body: unknown): Promise<{ ok: true; id: string }> {
    const parsed = seedBillingCustomerSchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error, "Invalid seed request");
    const { providerCustomerId, provider, orgSlug, userEmail } = parsed.data;

    if (Boolean(orgSlug) === Boolean(userEmail)) {
      badRequest("exactly one of orgSlug / userEmail is required");
    }

    let organizationId: string | null = null;
    let accountId: string | null = null;

    if (orgSlug) {
      const org = await getOrgBySlug(this.db, orgSlug);
      if (!org) badRequest(`org ${orgSlug} not found`);
      organizationId = org.id;
    } else {
      const [row] = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, userEmail!))
        .limit(1);
      if (!row) badRequest(`user ${userEmail} not found`);
      const [account] = await this.db
        .select({ id: personalAccount.id })
        .from(personalAccount)
        .where(eq(personalAccount.userId, row.id))
        .limit(1);
      if (!account) badRequest(`no personal account for ${userEmail}`);
      accountId = account.id;
    }

    const [created] = await this.db
      .insert(billingCustomer)
      .values({ provider, providerCustomerId, organizationId, accountId })
      .returning({ id: billingCustomer.id });
    if (!created) throw new Error("billing customer insert returned no row");
    return { ok: true, id: created.id };
  }
}
