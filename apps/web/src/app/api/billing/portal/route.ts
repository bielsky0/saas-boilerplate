import { NextResponse, type NextRequest } from "next/server";

import { resolveBillingOwner } from "@/features/billing/context";
import { openBillingPortal } from "@/features/billing/checkout";
import { portalInputSchema } from "@/features/billing/schema";
import { apiError, invalidJson, validationFailed } from "@/lib/validation/http";

/**
 * Customer portal (spec 5.5) — payment method, invoices, plan change, cancel.
 *
 * Same shape as the checkout route: session via the proxy, `billing.manage`
 * re-checked here, provider URL returned as JSON for the client to navigate to.
 *
 * Changes the user makes in the portal come back as webhooks; this route never
 * writes subscription state, and the app does not poll the provider on page load
 * (spec 5.5 is explicit about that).
 *
 * Body: { slug? }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!body) return invalidJson();

  const parsed = portalInputSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error, "Invalid portal request");

  const ctx = await resolveBillingOwner(parsed.data.slug ?? null);
  const result = await openBillingPortal(ctx);

  if (result.ok) return NextResponse.json({ url: result.url }, { status: 200 });
  // Never checked out → nothing to manage. 404 keeps this indistinguishable from
  // an unconfigured deployment, which is fine: both mean "no portal here".
  if (result.code === "NO_CUSTOMER") return apiError("No billing customer yet", 404);
  if (result.code === "NOT_CONFIGURED") return apiError("Billing is not configured", 404);
  return apiError("Payment provider is unavailable", 502);
}
