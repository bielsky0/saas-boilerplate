/**
 * Billing provider adapter (spec 1.2, 5.1 — pluggable payments backend).
 *
 * Third reference adapter alongside `../auth` and `../email`. Feature code
 * imports the singleton `billing` and the contract types; it never imports a
 * provider SDK. The concrete provider is chosen at startup by BILLING_PROVIDER
 * (none/dev vs Stripe), exactly as `../email` picks log vs Resend.
 *
 * Covers webhook verification/parsing (spec 5.4) plus the money path: customer
 * creation, checkout and portal sessions (spec 5.3, 5.5). Lemon Squeezy, Paddle,
 * PayPal, Dodo and Polar plug in by implementing `BillingAdapter`.
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
  BillingOperationErrorCode,
  BillingPaymentData,
  BillingPaymentEventType,
  BillingPaymentStatus,
  BillingRedirectResult,
  BillingSubscriptionData,
  BillingSubscriptionEventType,
  BillingSubscriptionStatus,
  BillingWebhookErrorCode,
  CheckoutSessionInput,
  CreateCustomerInput,
  CreateCustomerResult,
  PortalSessionInput,
  VerifyWebhookResult,
} from "./contract";
