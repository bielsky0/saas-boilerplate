import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";

/**
 * Dev-only: seed a Connect account id onto an org for E2E testing.
 * 404 in production.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body: { orgSlug?: string; accountId?: string } = await request.json().catch(() => ({}));
  if (!body.orgSlug || !body.accountId) {
    return NextResponse.json({ error: "orgSlug and accountId required" }, { status: 400 });
  }

  const [row] = await db
    .update(organization)
    .set({
      stripeConnectAccountId: body.accountId,
      stripeConnectStatus: "onboarding_incomplete",
      updatedAt: new Date(),
    })
    .where(eq(organization.slug, body.orgSlug))
    .returning({ id: organization.id, slug: organization.slug });

  if (!row) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "ok", org: row.slug, accountId: body.accountId });
}
