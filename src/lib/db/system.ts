import { sql } from "drizzle-orm";

import { db } from ".";
import { createLogger } from "@/lib/logger";
import type { TenantDb } from "./tenant";

const log = createLogger("db:system");

/**
 * The documented way OUT of Row-Level Security (spec §1.3).
 *
 * A few callers legitimately need to see across tenants: the super-admin panel
 * (cross-tenant by design), webhook handlers that must resolve an owner before
 * they know one, and system jobs that sweep every organization. Without an
 * explicit door they would each invent their own, and the interesting question —
 * "who can read everything?" — would stop having an answer.
 *
 * So this is the door, and it is fenced. `eslint.config.mjs` restricts importing
 * this module, so a new consumer has to add itself to that allow-list in a diff
 * someone reviews. That is the same treatment `features/admin/data.ts` already
 * gets for being deliberately cross-tenant.
 *
 * WHY A GUC AND NOT A SECOND ROLE. A second connection as a BYPASSRLS role would
 * be stronger — SQL injection on the tenant path could not reach it. It would
 * also mean a third URL, a second pool, and breaking `src/lib/db/index.ts`'s
 * "the only place the application opens a connection". For Faza 0 the only real
 * traffic through here is the super-admin panel, so the GUC is the proportionate
 * choice. Revisit when F1 puts the boilerplate's own tables under RLS and this
 * path gets hot; the migration is a policy edit, not a rewrite.
 *
 * F1a REVISITED IT, AND THE GUC STAYS. The predicted hot path did not appear:
 * the retrofit added five consumers (the cross-tenant org reads, the two admin
 * modules, the storage purge sweep, the onboarding subscription check), none of
 * them per-request. `requireOrgAccess` — the one path that IS per-request — was
 * deliberately routed through `withTenant` instead, precisely so it would not
 * land here: a `warn` on every authenticated request would drown the log line
 * whose entire purpose is to make deliberate holes countable. If a later phase
 * does make this hot, the second-role migration is still a policy edit.
 */
export async function withSystemBypass<T>(
  reason: string,
  fn: (tx: TenantDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Transaction-scoped for the same reason as withTenant: a session-scoped
    // bypass would outlive this call on a pooled connection and silently disable
    // isolation for whatever ran next.
    await tx.execute(sql`select set_config('app.bypass_rls', 'on', true)`);
    // Logged at warn, not debug: every one of these is a deliberate hole in
    // tenant isolation, and they should be countable in production logs. Pass a
    // literal — `reason` is documentation for whoever reads that line at 3am.
    log.warn("rls bypass", { reason });
    return fn(tx);
  });
}
