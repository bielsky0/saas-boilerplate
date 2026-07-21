import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { getOrgBySubdomain } from "@/features/organizations/data";
import { withTenant } from "@/lib/db/tenant";
import { staffSessionHandoff } from "@/lib/db/schema";
import { env } from "@/lib/env/server";

/**
 * Test-only inspector and clock for staff session handoff tokens (plan Faza
 * 5.5, decyzja D74). Disabled in production. Same shape as `/api/dev/client-auth`.
 *
 * GET counts live (unconsumed, unexpired) and consumed rows for an org — the
 * suite needs this to assert "exactly one redemption won a race" without a
 * second HTTP round-trip through the real endpoint.
 *
 * POST ages every live row for an org into the past, so the expiry test does
 * not need to sleep three minutes.
 */
type Body = {
  subdomain: string;
  action: "expire";
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const subdomain = request.nextUrl.searchParams.get("subdomain");
  if (!subdomain) {
    return NextResponse.json({ error: "subdomain is required" }, { status: 400 });
  }

  const organization = await getOrgBySubdomain(subdomain.trim().toLowerCase());
  if (!organization) {
    return NextResponse.json({ error: "unknown organization" }, { status: 404 });
  }

  const [state] = await withTenant(organization.id, (tx) =>
    tx
      .select({
        live: sql<number>`count(*) filter (where "consumedAt" is null and "expiresAt" > now())::int`,
        consumed: sql<number>`count(*) filter (where "consumedAt" is not null)::int`,
      })
      .from(staffSessionHandoff)
      .where(eq(staffSessionHandoff.organizationId, organization.id)),
  );

  return NextResponse.json({ ok: true, ...(state ?? { live: 0, consumed: 0 }) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  if (!body.subdomain || body.action !== "expire") {
    return NextResponse.json({ error: "subdomain and a known action" }, { status: 400 });
  }

  const organization = await getOrgBySubdomain(body.subdomain.trim().toLowerCase());
  if (!organization) {
    return NextResponse.json({ error: "unknown organization" }, { status: 404 });
  }

  const expired = await withTenant(organization.id, async (tx) => {
    const rows = await tx
      .update(staffSessionHandoff)
      // One second ago, not "now": `consumeStaffSessionHandoff` requires
      // `expiresAt > now()`, and an equal timestamp would leave the outcome
      // depending on which side of the boundary Postgres evaluated.
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(staffSessionHandoff.organizationId, organization.id),
          isNull(staffSessionHandoff.consumedAt),
        ),
      )
      .returning({ id: staffSessionHandoff.id });
    return rows.length;
  });

  return NextResponse.json({ ok: true, expired });
}
