import { NextResponse, type NextRequest } from "next/server";

import { billing } from "@/lib/adapters/billing";
import { db } from "@/lib/db";
import { withOwner } from "@/lib/db/tenant";
import { requireOrgPermission } from "@/features/organizations/context";
import { getOrgConnectStatus, setConnectAccountId } from "@/features/billing/connect-data";

/**
 * Authorize Stripe Connect for the current organization (GET, redirect flow).
 *
 * This is a NAVIGATIONAL endpoint, not an API fetch endpoint. The browser
 * follows the 302 to Stripe's hosted onboarding (Account Link).
 *
 * Flow:
 *   1. Check permission (billing_connect.manage, owner-only).
 *   2. If organization.country is null → 302 back to panel with
 *      ?connect=country_required so UI shows the country picker.
 *   3. Create a Standard Connect account via API (if not already created).
 *   4. Generate an Account Onboarding link.
 *   5. 302 redirect to Stripe's onboarding URL.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const ctx = await requireOrgPermission("billing_connect.manage");

  const status = await db.transaction((tx) => getOrgConnectStatus(tx, ctx.org.id));
  if (!status || !status.country) {
    const panelUrl = new URL("/dashboard/settings/billing", _request.url);
    panelUrl.searchParams.set("connect", "country_required");
    return NextResponse.redirect(panelUrl.toString());
  }

  // Check if an account already exists from a previous attempt.
  if (status.stripeConnectAccountId) {
    // Account exists but onboarding wasn't completed — generate a new link.
    const linkResult = await billing.createAccountOnboardingLink({
      accountId: status.stripeConnectAccountId,
      returnUrl: new URL(
        "/dashboard/settings/billing?connect=pending",
        _request.url,
      ).toString(),
      refreshUrl: new URL("/api/billing/connect/authorize", _request.url).toString(),
    });

    if (!linkResult.ok) {
      return NextResponse.json(
        { error: "Failed to generate onboarding link" },
        { status: 502 },
      );
    }

    return NextResponse.redirect(linkResult.url);
  }

  // Create a new Connect account.
  const accountResult = await billing.createConnectAccount({
    country: status.country,
  });
  if (!accountResult.ok) {
    return NextResponse.json(
      { error: "Failed to create Connect account" },
      { status: 502 },
    );
  }

  // Persist the account id before redirecting.
  await withOwner(
    { kind: "organization", organizationId: ctx.org.id },
    (tx) => setConnectAccountId(tx, ctx.org.id, accountResult.accountId),
  );

  // Generate the onboarding link.
  const linkResult = await billing.createAccountOnboardingLink({
    accountId: accountResult.accountId,
    returnUrl: new URL(
      "/dashboard/settings/billing?connect=pending",
      _request.url,
    ).toString(),
    refreshUrl: new URL("/api/billing/connect/authorize", _request.url).toString(),
  });

  if (!linkResult.ok) {
    return NextResponse.json(
      { error: "Failed to generate onboarding link" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(linkResult.url);
}
