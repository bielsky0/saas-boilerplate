import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { getOrgBySlug, getPersonalAccountByUserId } from "@/features/organizations/data";
import { db } from "@/lib/db";
import { billingCustomer, user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";

/**
 * Test-only billing customer seeder (spec 14.1). Maps a provider customer id
 * onto a tenant owner so webhook E2E tests have a resolvable customer without
 * running checkout (spec 5.3), which does not exist yet. Disabled in production.
 *
 * Body: { providerCustomerId, provider?, orgSlug? | userEmail? }
 * Exactly one of orgSlug / userEmail must be given — mirroring the XOR the
 * billing_customer_owner_ck constraint enforces.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json()) as {
    providerCustomerId?: string;
    provider?: string;
    orgSlug?: string;
    userEmail?: string;
  };

  if (!body.providerCustomerId) {
    return NextResponse.json({ error: "providerCustomerId is required" }, { status: 400 });
  }
  if (Boolean(body.orgSlug) === Boolean(body.userEmail)) {
    return NextResponse.json(
      { error: "exactly one of orgSlug / userEmail is required" },
      { status: 400 },
    );
  }

  let organizationId: string | null = null;
  let accountId: string | null = null;

  if (body.orgSlug) {
    const org = await getOrgBySlug(body.orgSlug);
    if (!org) return NextResponse.json({ error: `org ${body.orgSlug} not found` }, { status: 400 });
    organizationId = org.id;
  } else {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, body.userEmail!))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: `user ${body.userEmail} not found` }, { status: 400 });
    }
    const account = await getPersonalAccountByUserId(row.id);
    if (!account) {
      return NextResponse.json(
        { error: `no personal account for ${body.userEmail}` },
        { status: 400 },
      );
    }
    accountId = account.id;
  }

  const [created] = await db
    .insert(billingCustomer)
    .values({
      provider: body.provider ?? "stripe",
      providerCustomerId: body.providerCustomerId,
      organizationId,
      accountId,
    })
    .returning({ id: billingCustomer.id });

  return NextResponse.json({ ok: true, id: created!.id });
}
