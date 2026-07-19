import { and, eq, isNull } from "drizzle-orm";

import type { TenantDb } from "@/lib/db/tenant";
import { location } from "@/lib/db/schema";

/**
 * Locations data access (langlion §1.2, §2.12).
 *
 * TWO THINGS DIFFER FROM THE BOILERPLATE'S `data.ts` MODULES, and both are
 * deliberate:
 *
 * 1. Every function takes `tx: TenantDb` instead of reaching for `db`. The caller
 *    opens the transaction with `withTenant`, which is what sets the RLS context.
 *    Taking the handle as a parameter turns "forgot the tenant context" into a
 *    compile error rather than a query that quietly returns nothing.
 *
 * 2. `organizationId` is ALSO passed and ALSO filtered on, even though RLS would
 *    already hide other tenants' rows. That is not belt-and-braces for its own
 *    sake: the explicit predicate is what uses `location_org_idx`, and US-1.1/AC1
 *    is specifically about isolation holding when this filter is missing. If the
 *    filter were dropped because "RLS handles it", the test for AC1 would pass
 *    while testing nothing.
 */

/** Active locations for an academy, alphabetically. */
export async function listLocations(tx: TenantDb, organizationId: string) {
  return tx
    .select()
    .from(location)
    .where(and(eq(location.organizationId, organizationId), isNull(location.deletedAt)))
    .orderBy(location.name);
}

/** One active location, or null. */
export async function getLocation(tx: TenantDb, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(location)
    .where(
      and(
        eq(location.id, id),
        eq(location.organizationId, organizationId),
        isNull(location.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
