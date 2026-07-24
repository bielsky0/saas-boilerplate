import type {
  BillingAdapter,
  BillingRedirectResult,
  CreateConnectAccountResult,
  CreateCustomerResult,
  VerifyConnectWebhookResult,
  VerifyWebhookResult,
} from "./contract";

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
 *
 * Every money-path operation answers NOT_CONFIGURED for the same reason: the
 * routes turn that into a 404, so an unconfigured deployment does not advertise a
 * checkout it cannot complete.
 */
export const noneBillingAdapter: BillingAdapter = {
  provider: "none",

  async verifyWebhook(): Promise<VerifyWebhookResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },

  async createCustomer(): Promise<CreateCustomerResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },

  async createCheckoutSession(): Promise<BillingRedirectResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },

  async createPortalSession(): Promise<BillingRedirectResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },

  async verifyConnectWebhook(): Promise<VerifyConnectWebhookResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },

  async createConnectAccount(): Promise<CreateConnectAccountResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },

  async createAccountOnboardingLink(): Promise<BillingRedirectResult> {
    return { ok: false, code: "NOT_CONFIGURED" };
  },
};
