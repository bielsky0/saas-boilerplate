import type { BillingAdapter } from "@repo/contracts";

import { noneBillingAdapter } from "./none";
import { createStripeBillingAdapter, type StripeAdapterKeys } from "./stripe";

/**
 * Billing adapter selection (spec 1.2, 5.1 — pluggable payments backend).
 *
 * Feature code injects `BILLING_ADAPTER` and never imports a provider SDK.
 * The concrete provider is chosen from validated config (never `process.env`
 * directly — spec 19.1), exactly as the email module picks log vs Resend.
 *
 * The factory takes explicit arguments rather than reading config itself, so
 * selection stays testable and the module file owns the config mapping in one
 * place. The default (`none`) must NEVER throw: provider instantiation runs at
 * boot, and a throwing default would break boot for every deployment without
 * that vendor configured.
 */

/** Injection token for the billing adapter — feature code injects this. */
export const BILLING_ADAPTER = Symbol("BILLING_ADAPTER");

export interface BillingAdapterSelection {
  provider: string;
  keys: StripeAdapterKeys;
}

export function createBillingAdapter(selection: BillingAdapterSelection): BillingAdapter {
  switch (selection.provider) {
    case "stripe":
      return createStripeBillingAdapter(selection.keys);
    case "none":
    default:
      return noneBillingAdapter;
  }
}
