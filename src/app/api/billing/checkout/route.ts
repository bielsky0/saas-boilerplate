import { NextResponse, type NextRequest } from "next/server";

import { resolveBillingOwner } from "@/features/billing/context";
import { startCheckout } from "@/features/billing/checkout";
import { checkoutInputSchema } from "@/features/billing/schema";
import { purchasablePlan } from "@/features/billing/plans";
import { apiError, invalidJson, validationFailed } from "@/lib/validation/http";

/**
 * Hosted checkout (spec 5.3).
 *
 * Session-protected by the proxy; still resolves the owner + RBAC here, because
 * the proxy is a UX convenience, not the security boundary. Org context requires
 * `billing.manage` (owner-only) via the shared chokepoint.
 *
 * Returns the provider URL as JSON rather than a 3xx: the caller is `fetch` from
 * a client component, and a redirect would be followed opaquely by the browser,
 * leaving no way to surface a provider failure. The client navigates.
 *
 * NOT_CONFIGURED becomes 404, matching how the webhook route behaves with
 * BILLING_PROVIDER=none — an unconfigured deployment does not advertise a
 * checkout it cannot complete.
 *
 * Body: { slug?, plan }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!body) return invalidJson();

  const parsed = checkoutInputSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error, "Invalid checkout request");

  // A configured-but-unpriced plan (and the free plan, which has no price id by
  // construction) is not purchasable — 404 rather than 422: the request is
  // well-formed, the resource just does not exist in this environment.
  const plan = purchasablePlan(parsed.data.plan);
  if (!plan) return apiError("Plan is not available for purchase", 404);

  const ctx = await resolveBillingOwner(parsed.data.slug ?? null);
  const result = await startCheckout(ctx, plan);

  if (result.ok) return NextResponse.json({ url: result.url }, { status: 200 });
  if (result.code === "NOT_CONFIGURED") return apiError("Billing is not configured", 404);
  return apiError("Payment provider is unavailable", 502);
}
