import { sql } from "drizzle-orm";

import { db } from ".";

/**
 * Owner-scoped database access (spec §1.3, US-1.1/AC1).
 *
 * Every read and write of a table under Row-Level Security goes through
 * `withOwner` (or `withTenant`, its organization-only shorthand). It opens a
 * transaction and stamps the active owner onto it, which is what the policies
 * read to decide which rows exist.
 *
 * RLS IS THE SECOND LINE, NOT THE FIRST. Data-access functions still filter by
 * `organizationId`/`accountId` explicitly — that filter is what hits the index,
 * and US-1.1/AC1 is specifically about isolation surviving the day someone
 * forgets it. A policy that is never actually load-bearing is a policy nobody
 * notices has broken.
 *
 * TWO OWNER SHAPES, because the boilerplate's tenant tables have two (F1a). A
 * langlion table is always owned by an organization; `file`, `notification` and
 * the billing tables are owned by an organization XOR a personal account, which
 * the schema enforces with a CHECK. The policy mirrors that CHECK with two
 * disjuncts, one per GUC — see `0016_rls_boilerplate_tenant.sql`.
 */

/**
 * The tenant a unit of work acts as. Mirrors the `(a IS NULL) <> (b IS NULL)`
 * CHECK on the XOR tables: exactly one owner, never both, never neither.
 *
 * This is the canonical type; `FileOwner` and `NotificationOwner` alias it.
 */
export type Owner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

/**
 * A transaction handle carrying owner context (an organization or a personal
 * account).
 *
 * Deliberately NOT satisfied by `db` itself. A `data.ts` function takes a
 * `TenantDb`, so calling one without an owner context is a compile error rather
 * than a query that quietly returns nothing. That property is the reason this is
 * an explicit parameter instead of ambient state in an `AsyncLocalStorage` (the
 * shape `src/lib/logger.ts` uses): with ambient context, a forgotten `withOwner`
 * degrades to a silent empty result set, and an empty result is indistinguishable
 * from "no rows matched".
 *
 * Not renamed to `OwnerDb` when the second shape arrived: the runtime handle is
 * identical, and a second opaque type would fork every DAL signature for no
 * additional compile-time guarantee.
 */
export type TenantDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` with RLS scoped to one owner.
 *
 * Three details in the one statement below are load-bearing:
 *
 * `set_config(...)` rather than `SET LOCAL`. `SET LOCAL` takes no placeholder, so
 * using it would mean interpolating the id into SQL text — a string concatenation
 * on the value that decides which tenant's data is visible. `set_config` is an
 * ordinary function call and parameterises normally.
 *
 * The third argument `true` means TRANSACTION scope: Postgres resets the setting
 * at COMMIT or ROLLBACK, so it cannot survive on a pooled connection into whoever
 * borrows it next. `false` would make it SESSION scope and leak one tenant's
 * context into another request — the single worst bug available in this file, and
 * a one-character edit away. `e2e/langlion-rls.spec.ts` pins it.
 *
 * BOTH GUCs ARE ALWAYS WRITTEN, never only the active one, and the inactive one
 * is blanked rather than left alone. Nesting is the reason: `db.transaction`
 * inside an open transaction opens a SAVEPOINT, not a new transaction, and a
 * transaction-scoped `set_config` survives its release. A wrapper that set only
 * its own GUC would leave the other one holding the enclosing scope's value, and
 * the inner unit of work would satisfy both policy disjuncts at once — visible to
 * two owners simultaneously. Blanking makes the empty string the deny value the
 * policy's `nullif(..., '')` already folds into NULL.
 */
export async function withOwner<T>(owner: Owner, fn: (tx: TenantDb) => Promise<T>): Promise<T> {
  const organizationId = owner.kind === "organization" ? owner.organizationId : "";
  const accountId = owner.kind === "personal" ? owner.accountId : "";
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.organization_id', ${organizationId}, true),
                 set_config('app.account_id', ${accountId}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Run `fn` with RLS scoped to one organization — the shorthand for the owner
 * shape every langlion table uses.
 *
 * Expressed through `withOwner` rather than setting its own GUC, so the
 * both-GUCs-always rule above holds for it too, by construction rather than by
 * remembering to repeat it here.
 */
export function withTenant<T>(
  organizationId: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return withOwner({ kind: "organization", organizationId }, fn);
}
