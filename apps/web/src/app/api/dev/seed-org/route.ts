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
 * Body: { ownerEmail, name?, slug?, members?: [{ email, role }] }
 * All emails must already exist (seed them via /api/dev/seed-user first).
 */
type Member = { email: string; role: string };

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json()) as {
    ownerEmail?: string;
    name?: string;
    slug?: string;
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

  const result = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({ name, slug, createdByUserId: ownerId })
      .returning({ id: organization.id, slug: organization.slug });
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

  return NextResponse.json({ ok: true, slug: result.slug, orgId: result.id });
}
