import { NextResponse, type NextRequest } from "next/server";

import {
  listPaymentsForOrganization,
  listSubscriptionsForOrganization,
  listWebhookEventsForOrganization,
} from "@/features/billing/data";
import { getOrgBySlug } from "@/features/organizations/data";
import { env } from "@/lib/env/server";

/**
 * Test-only billing state inspector (spec 14.1). Lets E2E tests assert what a
 * webhook actually wrote to the database — the in-process counterpart to the
 * `/api/dev/emails` outbox. Disabled in production.
 *
 * GET /api/dev/billing-state?orgSlug=acme
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const orgSlug = request.nextUrl.searchParams.get("orgSlug");
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }
  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    return NextResponse.json({ error: `org ${orgSlug} not found` }, { status: 400 });
  }

  const [subscriptions, payments, webhookEvents] = await Promise.all([
    listSubscriptionsForOrganization(org.id),
    listPaymentsForOrganization(org.id),
    listWebhookEventsForOrganization(org.id),
  ]);

  return NextResponse.json({
    subscriptions,
    payments,
    webhookEvents,
    // Summed here so a test can assert "no double charge" directly.
    totalPaid: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
  });
}
