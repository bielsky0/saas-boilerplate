import { sql } from "drizzle-orm";

import { db } from ".";

/**
 * Tenant-scoped database access for the langlion domain (spec §1.3, US-1.1/AC1).
 *
 * Every read and write of a langlion table goes through `withTenant`. It opens a
 * transaction and stamps the active organization onto it, which is what the
 * Row-Level Security policies read to decide which rows exist.
 *
 * RLS IS THE SECOND LINE, NOT THE FIRST. Data-access functions still filter by
 * `organizationId` explicitly — that filter is what hits the index, and
 * US-1.1/AC1 is specifically about isolation surviving the day someone forgets
 * it. A policy that is never actually load-bearing is a policy nobody notices has
 * broken.
 */

/**
 * A transaction handle carrying tenant context.
 *
 * Deliberately NOT satisfied by `db` itself. A langlion `data.ts` function takes
 * a `TenantDb`, so calling one without a tenant context is a compile error rather
 * than a query that quietly returns nothing. That property is the reason this is
 * an explicit parameter instead of ambient state in an `AsyncLocalStorage` (the
 * shape `src/lib/logger.ts` uses): with ambient context, a forgotten `withTenant`
 * degrades to a silent empty result set, and an empty result is indistinguishable
 * from "no rows matched".
 */
export type TenantDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` with RLS scoped to one organization.
 *
 * Two details in the one statement below are load-bearing:
 *
 * `set_config(...)` rather than `SET LOCAL`. `SET LOCAL` takes no placeholder, so
 * using it would mean interpolating `organizationId` into SQL text — a string
 * concatenation on the value that decides which tenant's data is visible.
 * `set_config` is an ordinary function call and parameterises normally.
 *
 * The third argument `true` means TRANSACTION scope: Postgres resets the setting
 * at COMMIT or ROLLBACK, so it cannot survive on a pooled connection into whoever
 * borrows it next. `false` would make it SESSION scope and leak one tenant's
 * context into another request — the single worst bug available in this file, and
 * a one-character edit away. `e2e/langlion-rls.spec.ts` pins it.
 */
export async function withTenant<T>(
  organizationId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
