import { NextResponse, type NextRequest } from "next/server";

import {
  listPaymentsForOrganization,
  listSubscriptionsForOrganization,
  listWebhookEventsForOrganization,
} from "@/features/billing/data";
import { getOrgBySlug } from "@/features/organizations/data";
import { withTenant } from "@/lib/db/tenant";
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

  // Sequential inside one tenant context, NOT `Promise.all`. The previous
  // parallel form was safe only because each function took its own pooled
  // connection; three queries sharing one transaction's connection cannot be
  // fired concurrently.
  const { subscriptions, payments, webhookEvents } = await withTenant(org.id, async (tx) => ({
    subscriptions: await listSubscriptionsForOrganization(tx, org.id),
    payments: await listPaymentsForOrganization(tx, org.id),
    webhookEvents: await listWebhookEventsForOrganization(tx, org.id),
  }));

  return NextResponse.json({
    subscriptions,
    payments,
    webhookEvents,
    // Summed here so a test can assert "no double charge" directly.
    totalPaid: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
  });
}
