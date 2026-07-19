import { inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { membership, organization, user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";
import { resolveUniqueSlug } from "@/features/organizations/slug";
import { isSlugTaken } from "@/features/organizations/data";

/**
 * Test-only organization seeder (spec 14.1). Creates an org owned by an existing
 * seeded user and adds members with roles, without driving the UI — so RBAC and
 * context-switch E2E tests have deterministic fixtures. Disabled in production.
 *
 * Body: { ownerEmail, name?, slug?, subdomain?, timezone?, currency?,
 *         members?: [{ email, role }] }
 * All emails must already exist (seed them via /api/dev/seed-user first).
 *
 * `timezone`/`currency` fall back to constants here even though the production
 * path forbids a default (Constraint 5). That asymmetry is deliberate: the rule
 * exists so a human never creates an academy with a currency they did not look
 * at, and there is no human in a fixture. `subdomain` is different — it is
 * UNIQUE, so it is minted per call rather than defaulted, for the same reason
 * every spec mints a `uniqueEmail()`: the suite shares one database with no
 * teardown, and parallel workers would collide on a constant.
 */
type Member = { email: string; role: string };

const SEED_TIMEZONE = "Europe/Warsaw";
const SEED_CURRENCY = "PLN";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json()) as {
    ownerEmail?: string;
    name?: string;
    slug?: string;
    subdomain?: string;
    timezone?: string;
    currency?: string;
    members?: Member[];
  };
  if (!body.ownerEmail) {
    return NextResponse.json({ error: "ownerEmail is required" }, { status: 400 });
  }

  const members = body.members ?? [];
  const emails = [body.ownerEmail, ...members.map((m) => m.email)];
  const users = await db.select().from(user).where(inArray(user.email, emails));
  const idByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  const ownerId = idByEmail.get(body.ownerEmail.toLowerCase());
  if (!ownerId) {
    return NextResponse.json({ error: `owner ${body.ownerEmail} not found` }, { status: 400 });
  }

  const name = body.name ?? "E2E Org";
  const slug = await resolveUniqueSlug(body.slug ?? name, isSlugTaken);
  // Derived from the already-unique slug, so a caller that passes neither still
  // gets a subdomain no parallel worker can collide with.
  const subdomain = body.subdomain ?? slug;

  const result = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({
        name,
        slug,
        subdomain,
        timezone: body.timezone ?? SEED_TIMEZONE,
        currency: body.currency ?? SEED_CURRENCY,
        createdByUserId: ownerId,
      })
      .returning({
        id: organization.id,
        slug: organization.slug,
        subdomain: organization.subdomain,
      });
    await tx
      .insert(membership)
      .values({ organizationId: org!.id, userId: ownerId, role: "owner", status: "active" });
    for (const m of members) {
      const uid = idByEmail.get(m.email.toLowerCase());
      if (!uid) continue;
      await tx
        .insert(membership)
        .values({ organizationId: org!.id, userId: uid, role: m.role, status: "active" })
        .onConflictDoNothing();
    }
    return org!;
  });

  return NextResponse.json({
    ok: true,
    slug: result.slug,
    subdomain: result.subdomain,
    orgId: result.id,
  });
}
