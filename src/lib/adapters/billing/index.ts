/**
 * Billing provider adapter (spec 1.2, 5.1 — pluggable payments backend).
 *
 * Third reference adapter alongside `../auth` and `../email`. Feature code
 * imports the singleton `billing` and the contract types; it never imports a
 * provider SDK. The concrete provider is chosen at startup by BILLING_PROVIDER
 * (none/dev vs Stripe), exactly as `../email` picks log vs Resend.
 *
 * This phase covers webhook verification and parsing only (spec 5.4). Customer
 * creation, checkout & portal sessions and invoice retrieval land in later
 * phases behind the same interface; Lemon Squeezy, Paddle, PayPal, Dodo and
 * Polar plug in by implementing `BillingAdapter`.
 */

import { env } from "@/lib/env/server";
import type { BillingAdapter } from "./contract";
import { noneBillingAdapter } from "./none";
import { createStripeBillingAdapter } from "./stripe";

function createBillingAdapter(): BillingAdapter {
  switch (env.BILLING_PROVIDER) {
    case "stripe":
      return createStripeBillingAdapter();
    case "none":
    default:
      return noneBillingAdapter;
  }
}

export const billing: BillingAdapter = createBillingAdapter();

export type {
  BillingAdapter,
  BillingEvent,
  BillingEventType,
  BillingPaymentData,
  BillingPaymentEventType,
  BillingPaymentStatus,
  BillingSubscriptionData,
  BillingSubscriptionEventType,
  BillingSubscriptionStatus,
  BillingWebhookErrorCode,
  VerifyWebhookResult,
} from "./contract";
