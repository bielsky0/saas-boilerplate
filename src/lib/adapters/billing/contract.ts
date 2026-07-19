/**
 * Billing provider contract (spec 1.2, 5.1 — pluggable payments backend).
 *
 * Feature/server code depends ONLY on this interface and its DTO/error types —
 * never on a provider SDK. The concrete implementation (`./stripe.ts`) wraps one
 * provider and can be swapped for Lemon Squeezy / Paddle / PayPal / Dodo / Polar
 * without touching callers.
 *
 * Scope so far: webhook verification/parsing (spec 5.4) plus the money path —
 * customer creation, checkout and portal sessions (spec 5.3, 5.5). Subscription
 * updates and invoice retrieval are still deferred; the provider's hosted portal
 * covers both for now, which is exactly why §5.5 exists.
 */

/** Provider-neutral subscription state. Mirrors what every provider models. */
export type BillingSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type BillingPaymentStatus = "paid" | "failed" | "refunded";

export interface BillingSubscriptionData {
  providerSubscriptionId: string;
  providerPriceId: string;
  status: BillingSubscriptionStatus;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

export interface BillingPaymentData {
  providerPaymentId: string;
  /** Null for refunds and one-time payments — see schema/billing-payments.ts. */
  providerSubscriptionId: string | null;
  status: BillingPaymentStatus;
  /** Provider billing reason; "subscription_cycle" marks a renewal (spec 5.4). */
  reason: string | null;
  /** Minor units, exactly as the provider reports them. */
  amount: number;
  currency: string;
}

export type BillingSubscriptionEventType =
  "subscription.created" | "subscription.updated" | "subscription.canceled";

export type BillingPaymentEventType = "payment.succeeded" | "payment.failed" | "payment.refunded";

export type BillingEventType = BillingSubscriptionEventType | BillingPaymentEventType;

interface BillingEventBase {
  /** Which adapter produced this — flows into the `provider` column. */
  provider: string;
  /** The provider's event id. This is the idempotency key (spec 5.4). */
  id: string;
  /** When the PROVIDER created the event — the ordering watermark. */
  occurredAt: Date;
  /** Provider customer id, resolved to a tenant owner via `billing_customer`. */
  customerId: string;
}

/**
 * A parsed, provider-neutral event. Every subscription event carries the FULL
 * current subscription, so created/updated/canceled collapse into one upsert
 * ("the subscription looks like X as of time T") rather than three code paths.
 */
export type BillingEvent =
  | (BillingEventBase & {
      type: BillingSubscriptionEventType;
      subscription: BillingSubscriptionData;
    })
  | (BillingEventBase & { type: BillingPaymentEventType; payment: BillingPaymentData });

/**
 * Neutral error codes — callers never branch on SDK strings.
 * - NOT_CONFIGURED: no provider is wired up (BILLING_PROVIDER=none).
 * - INVALID_SIGNATURE: missing, malformed, stale or forged signature.
 * - MALFORMED_PAYLOAD: signature valid, but the body is not the shape we parse
 *   (typically provider API-version skew) — a real bug worth surfacing.
 */
export type BillingWebhookErrorCode =
  "NOT_CONFIGURED" | "INVALID_SIGNATURE" | "MALFORMED_PAYLOAD" | "UNKNOWN";

/**
 * Two orthogonal questions, two fields: `ok` answers "is this request
 * authentic?", `status` answers "do we act on it?". Splitting them forces the
 * route into an exhaustive switch, and beats `event: BillingEvent | null` where
 * "null means ignored" is implicit and easy to mishandle.
 */
export type VerifyWebhookResult =
  | { ok: true; status: "handled"; event: BillingEvent }
  /** Authentic, but a type we deliberately do not process. `eventType` is the
   *  raw provider string, carried for logging only — never for control flow. */
  | { ok: true; status: "ignored"; eventId: string; eventType: string }
  | { ok: false; code: BillingWebhookErrorCode };

/**
 * Neutral error codes for the money-path operations (spec 5.3, 5.5).
 *
 * Separate from `BillingWebhookErrorCode` because the failure modes do not
 * overlap: a webhook can be forged, an outbound API call cannot. `PROVIDER_ERROR`
 * is deliberately coarse — callers must not branch on a provider's error taxonomy,
 * which is precisely the lock-in this layer exists to prevent (spec 1.2). The
 * adapter logs the underlying cause; the caller gets a 502 and a generic message.
 */
export type BillingOperationErrorCode = "NOT_CONFIGURED" | "PROVIDER_ERROR";

/**
 * Checkout and portal both answer the same question — "where do I send the
 * browser?" — so they share one result shape. The provider hosts the page
 * (spec 5.3: we never build a card form, keeping PCI-DSS scope minimal).
 */
export type BillingRedirectResult =
  { ok: true; url: string } | { ok: false; code: BillingOperationErrorCode };

export type CreateCustomerResult =
  { ok: true; providerCustomerId: string } | { ok: false; code: BillingOperationErrorCode };

export interface CreateCustomerInput {
  email: string;
  name: string | null;
  /**
   * Tenant identity mirrored onto the provider record, for support and for
   * reconciliation when someone is staring at a provider dashboard. NEVER read
   * back as an authorization input: `billing_customer` is the only mapping we
   * trust (spec 5.4), because provider metadata is mutable from their UI.
   */
  metadata?: Record<string, string>;
}

export interface CheckoutSessionInput {
  providerCustomerId: string;
  providerPriceId: string;
  /** Seats for per-seat plans (spec 5.2); 1 for flat-rate. */
  quantity: number;
  /** Recurring plan vs one-time purchase — both required by spec 5.2. */
  mode: "subscription" | "payment";
  successUrl: string;
  cancelUrl: string;
}

export interface PortalSessionInput {
  providerCustomerId: string;
  returnUrl: string;
}

export interface BillingAdapter {
  /**
   * Which provider this adapter is, e.g. "stripe". Persisted on `billing_customer`
   * so two providers can coexist during a migration (spec 5.1) — the caller must
   * not hardcode a provider key it happens to know.
   */
  readonly provider: string;

  /**
   * Verify a webhook's signature and parse it into a neutral event.
   *
   * Takes the RAW request body: signatures are computed over the exact bytes
   * sent, so any re-serialization invalidates them. Takes `headers` (mirroring
   * `AuthAdapter`) so each adapter can read its own signature header.
   *
   * Async even where the underlying verification is synchronous, so an adapter
   * can move to WebCrypto (edge runtime) without a contract change.
   */
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifyWebhookResult>;

  /**
   * Create a customer on the provider and return its id.
   *
   * Deliberately does NOT write `billing_customer` — adapters know nothing about
   * our schema. The caller persists the mapping, and must do so BEFORE creating a
   * checkout session (the invariant documented on `schema/billing-customers.ts`):
   * that ordering is what lets the webhook treat an unresolvable customer as "not
   * ours" and ignore it, instead of retrying forever against a row that never
   * existed.
   */
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;

  /** Hosted checkout page for a plan purchase (spec 5.3). */
  createCheckoutSession(input: CheckoutSessionInput): Promise<BillingRedirectResult>;

  /**
   * Hosted customer portal: payment method, invoices, plan changes and
   * cancellation (spec 5.5). Changes made there come back as webhooks — the app
   * never polls the provider on page load.
   */
  createPortalSession(input: PortalSessionInput): Promise<BillingRedirectResult>;
}
