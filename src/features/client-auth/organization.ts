import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";

/**
 * Which academy is being served (langlion §2.27, rewizja 15.1).
 *
 * ─── THIS IS THE SEAM THE SUBDOMAIN MIDDLEWARE WILL PLUG INTO ───────────────
 *
 * The destination is `{organization.subdomain}.langlion.pl`, where the tenant
 * comes from the `Host` header and no caller states it. That middleware is F5
 * work — it also has to route CMS pages, own the reserved-slug list, and move
 * `/orgs/[slug]/…` to `/dashboard/…` — and it is explicitly NOT a dependency of
 * this phase.
 *
 * So the subdomain arrives from the caller for now. The value being the PUBLIC
 * subdomain rather than a raw `organizationId` is the point: it is the same
 * string the Host header will yield, so F5 changes where the string comes from
 * and nothing about what happens after. A route taking an `organizationId` would
 * instead have to be rewritten, and clients would have learned to pass an
 * internal id.
 *
 * NO RLS BYPASS IS INVOLVED, and that is structural rather than lucky:
 * `organization` is one of the two tables deliberately outside RLS, because a
 * policy keyed on the owner cannot be applied to the row that DEFINES the owner —
 * this query is what PRODUCES the value `withTenant` then sets. See the note in
 * `lib/db/schema/index.ts`. Every subsequent read and write in this feature runs
 * inside tenant context.
 */
export interface ServedOrganization {
  id: string;
  name: string;
  subdomain: string;
}

/**
 * Resolve an academy from its public subdomain, or null.
 *
 * Soft-deleted organizations resolve to null: an academy that has been removed
 * should not be able to issue login codes, and the alternative — resolving it and
 * remembering to check `deletedAt` at each call site — is a check someone
 * eventually skips.
 */
export async function findOrganizationBySubdomain(
  subdomain: string,
): Promise<ServedOrganization | null> {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      subdomain: organization.subdomain,
    })
    .from(organization)
    .where(and(eq(organization.subdomain, subdomain), isNull(organization.deletedAt)))
    .limit(1);
  return row ?? null;
}
