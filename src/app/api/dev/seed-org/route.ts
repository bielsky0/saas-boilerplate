import { inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
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

/**
 * Coerce a slug into a legal DNS label (D63, hardened in F4.6).
 *
 * A slug and a subdomain answer to different authorities, and the difference
 * only became load-bearing when the STAFF PANEL moved onto tenant hosts: an
 * academy whose subdomain is not a valid label is now unreachable altogether,
 * not merely missing a public site.
 *
 * The trap is specific and it has bitten before: `uniqueId()` from
 * billing-fixtures joins with UNDERSCORES, which `SUBDOMAIN_PATTERN` rejects, so
 * `parseHost` classifies such a host as `foreign` and every request answers 404
 * `unknown_organization`. The symptom (a broken tenant lookup) sits nowhere near
 * the cause (a fixture's id format), so this normalizes rather than trusting
 * callers to remember.
 *
 * Sanitizing here rather than rejecting is deliberate: the production path never
 * derives a subdomain from a slug at all — `createOrganizationAction` takes it as
 * a separate, required, `subdomainSchema`-validated field — so this is a
 * fixture-only convenience and refusing would only make specs restate the rule.
 */
function toDnsLabel(slug: string): string {
  const label = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  // SUBDOMAIN_MIN is 3; `slugify` has no such floor, so a short name would
  // otherwise produce a label the host parser refuses.
  return label.length >= 3 ? label : `org-${label}`;
}

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
  // gets a subdomain no parallel worker can collide with — but SANITIZED first,
  // see below.
  const subdomain = body.subdomain ?? toDnsLabel(slug);

  // `membership` is under RLS (F1a), so the seeder runs in tenant context like the
  // real `createOrganizationAction` does — deliberately NOT via the system bypass.
  // A seeder that takes a route production never takes would stop being evidence
  // that the production path works. The id is minted up front for the same reason
  // as in that action: the GUC must be set when the transaction opens.
  const organizationId = randomUUID();

  await withTenant(organizationId, async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name,
      slug,
      subdomain,
      timezone: body.timezone ?? SEED_TIMEZONE,
      currency: body.currency ?? SEED_CURRENCY,
      createdByUserId: ownerId,
    });
    await tx
      .insert(membership)
      .values({ organizationId, userId: ownerId, role: "owner", status: "active" });
    for (const m of members) {
      const uid = idByEmail.get(m.email.toLowerCase());
      if (!uid) continue;
      await tx
        .insert(membership)
        .values({ organizationId, userId: uid, role: m.role, status: "active" })
        .onConflictDoNothing();
    }
  });

  return NextResponse.json({ ok: true, slug, subdomain, orgId: organizationId });
}
