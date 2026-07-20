import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";

/**
 * Which academy is being served (langlion §2.27, rewizja 15.1).
 *
 * ─── THE SUBDOMAIN MIDDLEWARE IS NOW PLUGGED IN (F4.5) ──────────────────────
 *
 * The seam closed as designed. The subdomain used to arrive as a request field
 * (D39); it now comes from the `Host` header, resolved by `src/proxy.ts` and
 * read by `features/organizations/served-org.ts`, which is this function's only
 * caller of consequence. Betting on the PUBLIC subdomain rather than a raw
 * `organizationId` paid off exactly as intended: the change was deleting a field
 * from four route contracts. Nothing below this line moved.
 *
 * This function is no longer really client-auth's — it is the tenant lookup, and
 * `features/organizations/` is where it belongs. It stays here through F4.5 so
 * the routing diff is reviewable; move it in F4.6, when that layer is already
 * being disturbed.
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
