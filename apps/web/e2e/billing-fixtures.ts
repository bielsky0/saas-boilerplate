import Stripe from "stripe";

/**
 * Billing webhook test fixtures (spec 5.4).
 *
 * Signature verification is a local HMAC, so the whole webhook suite runs
 * offline: no Stripe account, no API key, no `stripe listen`. `sk_test_dummy`
 * never leaves the process — constructing a Stripe client makes no request.
 *
 * Imported by `playwright.config.ts`, so it must NOT import `@playwright/test`.
 */

/**
 * Spread into the web server's env by playwright.config.ts. Defined here so the
 * signing secret has ONE definition shared by the server that verifies and the
 * test that signs — if these drifted, every signature would fail for a reason
 * that looks nothing like the cause.
 */
export const E2E_BILLING_ENV = {
  BILLING_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_test_e2eDummyKeyNeverSentAnywhere",
  STRIPE_WEBHOOK_SECRET: "whsec_e2eDummySigningSecretForLocalHmac",
  // Maps to PLANS.pro, so a subscription on this price records planId="pro".
  STRIPE_PRICE_PRO: "price_e2e_pro",
} as const;

export const E2E_PRO_PRICE_ID = E2E_BILLING_ENV.STRIPE_PRICE_PRO;

const stripe = new Stripe(E2E_BILLING_ENV.STRIPE_SECRET_KEY);

/** Unique per call: the suite shares one database and never tears down. */
export function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Sign a raw body exactly as Stripe does.
 *
 * Takes the STRING that will be sent, not an object: the HMAC covers the exact
 * bytes, so the body must be serialized once and both signed and posted as that
 * same string.
 */
export function stripeSignature(
  rawBody: string,
  secret: string = E2E_BILLING_ENV.STRIPE_WEBHOOK_SECRET,
): string {
  return stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret });
}

/** Headers + body for a signed request, ready to spread into `request.post`. */
export function signedRequest(event: unknown, secret?: string) {
  const rawBody = JSON.stringify(event);
  return {
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSignature(rawBody, secret),
    },
    data: rawBody,
  };
}

type SubscriptionEventOpts = {
  eventId: string;
  customerId: string;
  subscriptionId: string;
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted";
  status?: string;
  createdAt?: number;
  priceId?: string;
};

/** Minimal `customer.subscription.*` payload — only the fields the adapter parses. */
export function subscriptionEvent(opts: SubscriptionEventOpts) {
  const created = opts.createdAt ?? Math.floor(Date.now() / 1000);
  return {
    id: opts.eventId,
    object: "event",
    created,
    type: opts.type,
    data: {
      object: {
        id: opts.subscriptionId,
        object: "subscription",
        customer: opts.customerId,
        status: opts.status ?? "active",
        cancel_at_period_end: false,
        items: {
          object: "list",
          data: [
            {
              id: uniqueId("si"),
              object: "subscription_item",
              price: { id: opts.priceId ?? E2E_PRO_PRICE_ID, object: "price" },
              quantity: 1,
              current_period_end: created + 30 * 24 * 60 * 60,
            },
          ],
        },
      },
    },
  };
}

type InvoiceEventOpts = {
  eventId: string;
  customerId: string;
  invoiceId: string;
  subscriptionId?: string;
  type: "invoice.paid" | "invoice.payment_failed";
  amount: number;
  createdAt?: number;
};

/** Minimal `invoice.*` payload. The subscription link lives under `parent`. */
export function invoiceEvent(opts: InvoiceEventOpts) {
  return {
    id: opts.eventId,
    object: "event",
    created: opts.createdAt ?? Math.floor(Date.now() / 1000),
    type: opts.type,
    data: {
      object: {
        id: opts.invoiceId,
        object: "invoice",
        customer: opts.customerId,
        currency: "usd",
        amount_paid: opts.type === "invoice.paid" ? opts.amount : 0,
        amount_due: opts.amount,
        billing_reason: "subscription_cycle",
        parent: opts.subscriptionId
          ? { subscription_details: { subscription: opts.subscriptionId } }
          : null,
      },
    },
  };
}
