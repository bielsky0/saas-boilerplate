import { billing } from "@/lib/adapters/billing";
import type { BillingRedirectResult } from "@/lib/adapters/billing";
import { apexUrl, tenantUrl } from "@/lib/tenant-url";
import { withOwner } from "@/lib/db/tenant";
import { getBillingCustomerForOwner, insertBillingCustomer } from "./data";
import type { BillingOwner, ResolvedBillingOwner } from "./context";
import type { Plan } from "./plans";

import { forbidden } from "next/navigation";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";

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

/**
 * Assert that the organization's Stripe Connect account is active.
 *
 * Called BEFORE any online checkout for class/package payments. Throws 403
 * when Connect is not active, so the backend is the final enforcement point
 * (spec §2.25). Cash payments MUST skip this check.
 *
 * This is forward-looking for F11 (online payments). The function exists now
 * so the enforcement pattern is visible and testable before F11 uses it.
 */
export async function assertConnectActive(orgId: string): Promise<void> {
  const [row] = await db
    .select({ status: organization.stripeConnectStatus })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (!row || row.status !== "active") {
    forbidden();
  }
}

/**
 * Where the provider sends the browser back to, per tenant context.
 *
 * ABSOLUTE AND REQUEST-AWARE (F4.6). These URLs are handed to Stripe, which
 * later redirects the browser to them, so they must name the host the user
 * actually started on. `absoluteUrl()` cannot do that: it is built on
 * `NEXT_PUBLIC_APP_URL`, which Next inlines at BUILD time, so one image can only
 * ever point at the apex — an academy admin would finish checkout on a host
 * where their session cookie does not exist and be asked to sign in again.
 *
 * The academy is identified by SUBDOMAIN, not slug: the panel is host-addressed
 * now, and `/dashboard/settings/billing` is the same path on every academy host.
 */
async function returnUrl(subdomain: string | null, query = ""): Promise<string> {
  const path = subdomain ? "/dashboard/settings/billing" : "/settings/billing";
  return subdomain ? tenantUrl(subdomain, `${path}${query}`) : apexUrl(`${path}${query}`);
}

/**
 * Find or create the provider customer for a tenant, persisting the mapping.
 *
 * Idempotent: an existing mapping short-circuits, so a user who abandons checkout
 * and returns does not accumulate duplicate provider customers.
 *
 * TWO OWNER CONTEXTS, NOT ONE. `billing_customer` came under RLS in F1b, so both
 * the read and the write need one — but they are opened separately, with the
 * provider call between them. A single `withOwner` spanning the whole function
 * would hold a pooled connection open across an HTTP round-trip to the provider:
 * the deadlock shape `features/admin/audit.ts` and `./webhooks.ts` both document,
 * with a provider outage as the trigger. Do not "simplify" these back into one.
 */
async function ensureBillingCustomer(
  owner: BillingOwner,
  email: string,
  name: string | null,
): Promise<
  | { ok: true; providerCustomerId: string }
  | { ok: false; code: "NOT_CONFIGURED" | "PROVIDER_ERROR" }
> {
  const existing = await withOwner(owner, (tx) =>
    getBillingCustomerForOwner(tx, billing.provider, owner),
  );
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

  await withOwner(owner, (tx) =>
    insertBillingCustomer(tx, billing.provider, created.providerCustomerId, owner),
  );
  return { ok: true, providerCustomerId: created.providerCustomerId };
}

/** Start a hosted checkout for `plan`, returning the URL to redirect to. */
export async function startCheckout(
  ctx: ResolvedBillingOwner,
  plan: Plan & { priceId: string },
): Promise<BillingRedirectResult> {
  const customer = await ensureBillingCustomer(ctx.owner, ctx.email, ctx.name);
  if (!customer.ok) return customer;

  const [successUrl, cancelUrl] = await Promise.all([
    returnUrl(ctx.orgSubdomain, "?checkout=success"),
    returnUrl(ctx.orgSubdomain, "?checkout=canceled"),
  ]);
  return billing.createCheckoutSession({
    providerCustomerId: customer.providerCustomerId,
    providerPriceId: plan.priceId,
    // Seats are synced from the provider via webhooks; checkout starts at one.
    quantity: 1,
    mode: plan.mode,
    successUrl,
    cancelUrl,
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
  const existing = await withOwner(ctx.owner, (tx) =>
    getBillingCustomerForOwner(tx, billing.provider, ctx.owner),
  );
  if (!existing) return { ok: false, code: "NO_CUSTOMER" };

  return billing.createPortalSession({
    providerCustomerId: existing.providerCustomerId,
    returnUrl: await returnUrl(ctx.orgSubdomain),
  });
}
