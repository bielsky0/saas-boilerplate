import Stripe from "stripe";
import { z } from "zod";

import { env } from "@/lib/env/server";
import { createLogger } from "@/lib/logger";
import type {
  BillingAdapter,
  BillingEvent,
  BillingRedirectResult,
  BillingSubscriptionStatus,
  CheckoutSessionInput,
  ConnectAccountStatus,
  ConnectEvent,
  CreateAccountOnboardingLinkInput,
  CreateConnectAccountInput,
  CreateConnectAccountResult,
  CreateCustomerInput,
  CreateCustomerResult,
  PortalSessionInput,
  VerifyConnectWebhookResult,
  VerifyWebhookResult,
} from "./contract";

/**
 * Stripe billing adapter (spec 5.1 — the reference payments implementation).
 *
 * The ONLY file in the codebase that imports the Stripe SDK. Everything else
 * depends on `./contract`, so swapping providers is one file (spec 1.2).
 *
 * DEPLOYMENT NOTE: signature verification is an HMAC over the exact bytes Stripe
 * sent. Any proxy that buffers, re-encodes or rewrites the request body breaks
 * it — the raw body must reach this adapter untouched.
 */

const PROVIDER = "stripe";

/**
 * Pinned deliberately to the literal the installed SDK reports as latest, rather
 * than tracking it. The SDK types `apiVersion` as exactly this literal, so an
 * SDK bump becomes a typecheck failure — a visible diff and a conscious decision
 * about payload-shape changes, never a silent behavior change.
 */
const API_VERSION = "2026-06-24.dahlia" satisfies Stripe.LatestApiVersion;

/**
 * Stripe types `data.object` against the SDK's pinned version, but the runtime
 * shape follows the version configured on the webhook ENDPOINT — and
 * `constructEvent` only does JSON.parse, it validates nothing. Parsing the few
 * fields we actually use turns that skew into a clean MALFORMED_PAYLOAD instead
 * of a silent `undefined` reaching the database.
 */
const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const satisfies readonly BillingSubscriptionStatus[];

/** Stripe sends ids as strings, or as full objects when a field is expanded. */
const idRef = z.union([z.string(), z.object({ id: z.string() })]).transform((v) => {
  return typeof v === "string" ? v : v.id;
});

const subscriptionObject = z.object({
  id: z.string(),
  customer: idRef,
  status: z.enum(SUBSCRIPTION_STATUSES),
  cancel_at_period_end: z.boolean(),
  items: z.object({
    // `current_period_end` moved from the Subscription to the SubscriptionItem
    // (verified against the installed SDK: Subscription no longer carries it).
    data: z
      .array(
        z.object({
          price: z.object({ id: z.string() }),
          quantity: z.number().int().optional(),
          current_period_end: z.number().int().optional(),
        }),
      )
      .min(1),
  }),
});

const invoiceObject = z.object({
  id: z.string(),
  customer: idRef,
  currency: z.string(),
  amount_paid: z.number().int(),
  amount_due: z.number().int(),
  billing_reason: z.string().nullish(),
  // `invoice.subscription` is gone; the link now lives under `parent`
  // (verified against the installed SDK).
  parent: z.object({ subscription_details: z.object({ subscription: idRef }).nullish() }).nullish(),
});

const chargeObject = z.object({
  id: z.string(),
  customer: idRef.nullish(),
  currency: z.string(),
  amount_refunded: z.number().int(),
});

/**
 * Explicit allowlist — anything else is `ignored`. We handle `invoice.paid` and
 * NOT `invoice.payment_succeeded`: both fire for the same money, so handling
 * both would burn two idempotency markers on one payment.
 */
function parseEvent(event: Stripe.Event): BillingEvent | null {
  const base = { provider: PROVIDER, id: event.id, occurredAt: new Date(event.created * 1000) };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = subscriptionObject.parse(event.data.object);
      const item = sub.items.data[0]!;
      const type =
        event.type === "customer.subscription.created"
          ? "subscription.created"
          : event.type === "customer.subscription.deleted"
            ? "subscription.canceled"
            : "subscription.updated";
      return {
        ...base,
        type,
        customerId: sub.customer,
        subscription: {
          providerSubscriptionId: sub.id,
          providerPriceId: item.price.id,
          status: sub.status,
          quantity: item.quantity ?? 1,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: item.current_period_end
            ? new Date(item.current_period_end * 1000)
            : null,
        },
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = invoiceObject.parse(event.data.object);
      const paid = event.type === "invoice.paid";
      return {
        ...base,
        type: paid ? "payment.succeeded" : "payment.failed",
        customerId: invoice.customer,
        payment: {
          providerPaymentId: invoice.id,
          providerSubscriptionId: invoice.parent?.subscription_details?.subscription ?? null,
          status: paid ? "paid" : "failed",
          // "subscription_cycle" is what marks a RENEWAL (spec 5.4).
          reason: invoice.billing_reason ?? null,
          amount: paid ? invoice.amount_paid : invoice.amount_due,
          currency: invoice.currency,
        },
      };
    }

    case "charge.refunded": {
      const charge = chargeObject.parse(event.data.object);
      // A charge with no customer cannot be attributed to a tenant.
      if (!charge.customer) return null;
      return {
        ...base,
        type: "payment.refunded",
        customerId: charge.customer,
        payment: {
          // Keyed on the charge, never merged onto the invoice row: Stripe's
          // 2026-06-24 API dropped `charge.invoice`, so correlating them would
          // need a live API call from inside the webhook.
          providerPaymentId: charge.id,
          providerSubscriptionId: null,
          status: "refunded",
          reason: null,
          amount: charge.amount_refunded,
          currency: charge.currency,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Parse a Connect event into a neutral ConnectEvent.
 * Handles account.updated and account.application.deauthorized.
 */
function parseConnectEvent(event: Stripe.Event): ConnectEvent | null {
  const base = { provider: PROVIDER, id: event.id, occurredAt: new Date(event.created * 1000) };

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as {
        id: string;
        charges_enabled?: boolean;
        payouts_enabled?: boolean;
        details_submitted?: boolean;
        requirements?: { disabled_reason?: string | null };
      };
      const detailsSubmitted = account.details_submitted ?? false;
      const chargesEnabled = account.charges_enabled ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;
      const disabledReason = account.requirements?.disabled_reason;

      let status: ConnectAccountStatus;
      if (disabledReason) {
        status = "disabled";
      } else if (detailsSubmitted && chargesEnabled && payoutsEnabled) {
        status = "active";
      } else if (detailsSubmitted && (!chargesEnabled || !payoutsEnabled)) {
        status = "restricted";
      } else {
        status = "onboarding_incomplete";
      }

      return {
        ...base,
        accountId: account.id,
        type: "account.updated",
        status,
        chargesEnabled,
        payoutsEnabled,
      };
    }

    case "account.application.deauthorized": {
      const account = event.data.object as { id: string };
      return {
        ...base,
        accountId: account.id,
        type: "account.application.deauthorized",
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    default:
      return null;
  }
}

export function createStripeBillingAdapter(): BillingAdapter {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. " +
        "Set them or use BILLING_PROVIDER=none.",
    );
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: API_VERSION });
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const connectWebhookSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const log = createLogger("billing.stripe");

  /**
   * Collapse any SDK throw into the contract's coarse `PROVIDER_ERROR`.
   *
   * The cause is logged here and nowhere else: callers must not see Stripe's
   * error taxonomy, or the abstraction that makes this adapter swappable leaks
   * into the routes (spec 1.2). Logged at `error` because an outbound call
   * failing is an operator problem — the user only ever sees a 502.
   */
  function providerError(operation: string, err: unknown): { ok: false; code: "PROVIDER_ERROR" } {
    log.error("provider call failed", { operation, err });
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  return {
    provider: PROVIDER,

    async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifyWebhookResult> {
      const signature = headers.get("stripe-signature");
      if (!signature) return { ok: false, code: "INVALID_SIGNATURE" };

      let event: Stripe.Event;
      try {
        // Pure local HMAC over the raw bytes — no network call, which is what
        // lets the E2E suite sign fixtures offline with a dummy secret.
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        // Covers a forged/mismatched signature and a stale timestamp alike.
        return { ok: false, code: "INVALID_SIGNATURE" };
      }

      try {
        const parsed = parseEvent(event);
        return parsed
          ? { ok: true, status: "handled", event: parsed }
          : { ok: true, status: "ignored", eventId: event.id, eventType: event.type };
      } catch {
        return { ok: false, code: "MALFORMED_PAYLOAD" };
      }
    },

    async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
      try {
        const customer = await stripe.customers.create({
          email: input.email,
          ...(input.name ? { name: input.name } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        });
        return { ok: true, providerCustomerId: customer.id };
      } catch (err) {
        return providerError("createCustomer", err);
      }
    },

    async createCheckoutSession(input: CheckoutSessionInput): Promise<BillingRedirectResult> {
      try {
        const session = await stripe.checkout.sessions.create({
          mode: input.mode,
          customer: input.providerCustomerId,
          line_items: [{ price: input.providerPriceId, quantity: input.quantity }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
        });
        // `url` is null only for modes we never use (e.g. embedded UI). Treating
        // it as an error beats returning an empty redirect the caller would send
        // a browser to.
        return session.url
          ? { ok: true, url: session.url }
          : providerError("createCheckoutSession", new Error("session has no url"));
      } catch (err) {
        return providerError("createCheckoutSession", err);
      }
    },

    async createPortalSession(input: PortalSessionInput): Promise<BillingRedirectResult> {
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: input.providerCustomerId,
          return_url: input.returnUrl,
        });
        return { ok: true, url: session.url };
      } catch (err) {
        return providerError("createPortalSession", err);
      }
    },

    // ── Faza 10 — Stripe Connect (EPIK 30) ───────────────────────────────

    async verifyConnectWebhook(
      rawBody: string,
      headers: Headers,
    ): Promise<VerifyConnectWebhookResult> {
      if (!connectWebhookSecret) return { ok: false, code: "NOT_CONFIGURED" };

      const signature = headers.get("stripe-signature");
      if (!signature) return { ok: false, code: "INVALID_SIGNATURE" };

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, connectWebhookSecret);
      } catch {
        return { ok: false, code: "INVALID_SIGNATURE" };
      }

      try {
        const parsed = parseConnectEvent(event);
        return parsed
          ? { ok: true, status: "handled", event: parsed }
          : { ok: true, status: "ignored", eventId: event.id, eventType: event.type };
      } catch {
        return { ok: false, code: "MALFORMED_PAYLOAD" };
      }
    },

    async createConnectAccount(
      input: CreateConnectAccountInput,
    ): Promise<CreateConnectAccountResult> {
      try {
        const account = await stripe.accounts.create({
          type: "standard",
          country: input.country,
        });
        return { ok: true, accountId: account.id };
      } catch (err) {
        return providerError("createConnectAccount", err);
      }
    },

    async createAccountOnboardingLink(
      input: CreateAccountOnboardingLinkInput,
    ): Promise<BillingRedirectResult> {
      try {
        const link = await stripe.accountLinks.create({
          account: input.accountId,
          return_url: input.returnUrl,
          refresh_url: input.refreshUrl,
          type: "account_onboarding",
        });
        return { ok: true, url: link.url };
      } catch (err) {
        return providerError("createAccountOnboardingLink", err);
      }
    },
  };
}
