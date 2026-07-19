import { billing } from "@/lib/adapters/billing";
import type { BillingRedirectResult } from "@/lib/adapters/billing";
import { absoluteUrl } from "@/lib/site";
import { getBillingCustomerForOwner, insertBillingCustomer } from "./data";
import type { BillingOwner, ResolvedBillingOwner } from "./context";
import type { Plan } from "./plans";

/**
 * Checkout and customer portal (spec 5.3, 5.5).
 *
 * THE ORDERING INVARIANT (documented on `schema/billing-customers.ts`): the
 * provider customer is created and its mapping PERSISTED before any checkout
 * session exists. That is what lets the webhook treat an unresolvable customer as
 * "not ours" and ignore it, instead of retrying forever against a row that was
 * never written. Reversing these two steps produces a race that only shows up
 * under real provider latency, so it is enforced here in one place rather than
 * trusted to each caller.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: grant access. The success redirect only
 * brings the browser back; entitlement follows from the webhook (spec 5.3 — the
 * user can close the tab before ever being redirected). Nothing here writes a
 * subscription row.
 */

/** Where the provider sends the browser back to, per tenant context. */
function returnPath(orgSlug: string | null): string {
  return orgSlug ? `/orgs/${orgSlug}/settings/billing` : "/settings/billing";
}

/**
 * Find or create the provider customer for a tenant, persisting the mapping.
 *
 * Idempotent: an existing mapping short-circuits, so a user who abandons checkout
 * and returns does not accumulate duplicate provider customers.
 */
async function ensureBillingCustomer(
  owner: BillingOwner,
  email: string,
  name: string | null,
): Promise<
  | { ok: true; providerCustomerId: string }
  | { ok: false; code: "NOT_CONFIGURED" | "PROVIDER_ERROR" }
> {
  const existing = await getBillingCustomerForOwner(billing.provider, owner);
  if (existing) return { ok: true, providerCustomerId: existing.providerCustomerId };

  const created = await billing.createCustomer({
    email,
    name,
    // Mirrored for support/reconciliation only — never read back as an
    // authorization input (see the contract's note on provider metadata).
    metadata:
      owner.kind === "organization"
        ? { organizationId: owner.organizationId }
        : { accountId: owner.accountId },
  });
  if (!created.ok) return created;

  await insertBillingCustomer(billing.provider, created.providerCustomerId, owner);
  return { ok: true, providerCustomerId: created.providerCustomerId };
}

/** Start a hosted checkout for `plan`, returning the URL to redirect to. */
export async function startCheckout(
  ctx: ResolvedBillingOwner,
  plan: Plan & { priceId: string },
): Promise<BillingRedirectResult> {
  const customer = await ensureBillingCustomer(ctx.owner, ctx.email, ctx.name);
  if (!customer.ok) return customer;

  const back = returnPath(ctx.orgSlug);
  return billing.createCheckoutSession({
    providerCustomerId: customer.providerCustomerId,
    providerPriceId: plan.priceId,
    // Seats are synced from the provider via webhooks; checkout starts at one.
    quantity: 1,
    mode: plan.mode,
    successUrl: absoluteUrl(`${back}?checkout=success`),
    cancelUrl: absoluteUrl(`${back}?checkout=canceled`),
  });
}

/**
 * Open the provider's customer portal (spec 5.5).
 *
 * A tenant that has never checked out has no provider customer; rather than
 * creating one just to show an empty portal, that is reported as
 * `NO_CUSTOMER` so the route can 404 and the UI can hide the link.
 */
export async function openBillingPortal(
  ctx: ResolvedBillingOwner,
): Promise<BillingRedirectResult | { ok: false; code: "NO_CUSTOMER" }> {
  const existing = await getBillingCustomerForOwner(billing.provider, ctx.owner);
  if (!existing) return { ok: false, code: "NO_CUSTOMER" };

  return billing.createPortalSession({
    providerCustomerId: existing.providerCustomerId,
    returnUrl: absoluteUrl(returnPath(ctx.orgSlug)),
  });
}
