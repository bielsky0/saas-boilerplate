import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { getOrgBySubdomain } from "@/features/organizations/data";
import { withTenant } from "@/lib/db/tenant";
import { client, clientOtp, clientSession } from "@/lib/db/schema";
import { env } from "@/lib/env/server";

/**
 * Test-only inspector and clock for parent authentication (spec 14.1 pattern).
 * Disabled in production.
 *
 * TWO THINGS THE SUITE CANNOT DO FOR ITSELF, and nothing else:
 *
 *  - GET reads state that has no HTTP surface by design. A live session count and
 *    a consumed/live code count are exactly what the phase's acceptance criteria
 *    are about ("one session is created, not two"), and the production API
 *    deliberately answers neither — `/api/client-auth/session` says who you are,
 *    which cannot distinguish one session row from two.
 *  - POST ages codes. Expiry is a real requirement (US-4.5) and the alternative
 *    to moving the clock is a test that sleeps fifteen minutes.
 *
 * Both go through `withTenant`, like `seed-langlion`: a fixture that bypassed RLS
 * could mask a policy that rejects the application's own reads.
 *
 * ⚠️ IT CANNOT READ A CODE. There is no route, here or anywhere, that returns the
 * raw digits — only the SHA-256 is stored, so this endpoint could not answer even
 * if it wanted to. The suite reads codes from the dev email outbox, which is the
 * same path a real parent uses, and that is the point: a fixture that handed the
 * test its own credential would stop proving the delivery half works.
 */
type Body = {
  subdomain: string;
  email: string;
  /** Push every live code for this address into the past. */
  action: "expire-codes";
};

async function resolve(subdomain: string) {
  return getOrgBySubdomain(subdomain.trim().toLowerCase());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const subdomain = request.nextUrl.searchParams.get("subdomain");
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!subdomain || !email) {
    return NextResponse.json({ error: "subdomain and email are required" }, { status: 400 });
  }

  const organization = await resolve(subdomain);
  if (!organization) {
    return NextResponse.json({ error: "unknown organization" }, { status: 404 });
  }

  const state = await withTenant(organization.id, async (tx) => {
    const [parent] = await tx
      .select({ id: client.id, isVerified: client.isVerified })
      .from(client)
      .where(and(eq(client.organizationId, organization.id), eq(client.email, email)))
      .limit(1);

    const [codes] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        live: sql<number>`count(*) filter (where "consumedAt" is null and "expiresAt" > now())::int`,
        maxAttempts: sql<number>`coalesce(max("attempts"), 0)::int`,
      })
      .from(clientOtp)
      .where(and(eq(clientOtp.organizationId, organization.id), eq(clientOtp.email, email)));

    const [sessions] = parent
      ? await tx
          .select({ live: sql<number>`count(*) filter (where "expiresAt" > now())::int` })
          .from(clientSession)
          .where(
            and(
              eq(clientSession.organizationId, organization.id),
              eq(clientSession.clientId, parent.id),
            ),
          )
      : [{ live: 0 }];

    return {
      organizationId: organization.id,
      clientId: parent?.id ?? null,
      isVerified: parent?.isVerified ?? null,
      codes: codes ?? { total: 0, live: 0, maxAttempts: 0 },
      liveSessions: sessions?.live ?? 0,
    };
  });

  return NextResponse.json({ ok: true, ...state });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  if (!body.subdomain || !body.email || body.action !== "expire-codes") {
    return NextResponse.json({ error: "subdomain, email and a known action" }, { status: 400 });
  }

  const organization = await resolve(body.subdomain);
  if (!organization) {
    return NextResponse.json({ error: "unknown organization" }, { status: 404 });
  }

  const email = body.email.trim().toLowerCase();

  const expired = await withTenant(organization.id, async (tx) => {
    const rows = await tx
      .update(clientOtp)
      // One second ago, not "now": `consumeOtp` requires `expiresAt > now()`, and
      // an equal timestamp would leave the outcome depending on which side of the
      // boundary Postgres evaluated — a flake, not a test.
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(clientOtp.organizationId, organization.id),
          eq(clientOtp.email, email),
          isNull(clientOtp.consumedAt),
        ),
      )
      .returning({ id: clientOtp.id });
    return rows.length;
  });

  return NextResponse.json({ ok: true, expired });
}
