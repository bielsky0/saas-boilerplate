import type { BillingAdapter, VerifyWebhookResult } from "./contract";

/**
 * Null billing adapter (spec 5.1) — the default when no payment provider is
 * configured, mirroring how `EMAIL_PROVIDER=log` keeps email harmless by
 * default.
 *
 * It exists so the adapter factory can run at module load without a provider:
 * the boilerplate must build and boot with zero Stripe configuration, and a
 * default that threw would break `next build` for everyone. It never verifies
 * anything, so the webhook route answers 404 rather than advertising an endpoint
 * this deployment cannot honour.
 */
export const noneBillingAdapter: BillingAdapter = {
  async verifyWebhook(): Promise<VerifyWebhookResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },
};
