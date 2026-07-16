/**
 * Billing provider contract (spec 1.2, 5.1 — pluggable payments backend).
 *
 * Feature/server code depends ONLY on this interface and its DTO/error types —
 * never on a provider SDK. The concrete implementation (`./stripe.ts`) wraps one
 * provider and can be swapped for Lemon Squeezy / Paddle / PayPal / Dodo / Polar
 * without touching callers.
 *
 * Scope for this phase: webhook verification and parsing only. The interface is
 * intentionally small but extensible — customer creation, checkout & portal
 * sessions, subscription updates and invoice retrieval are added in later phases
 * (the same staged approach as `../auth/contract.ts`).
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

export interface BillingAdapter {
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
}
