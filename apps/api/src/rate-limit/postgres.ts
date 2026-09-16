import { eq, sql } from "drizzle-orm";
import { Logger } from "@nestjs/common";

import { schema, type Db } from "@repo/db";
import {
  allowOnError,
  decide,
  decideNext,
  type RateLimitAdapter,
  type RateLimitDecision,
  type RateLimitRule,
} from "@repo/contracts";

/**
 * Shared rate-limit store — the Nest twin of the web app's
 * `src/lib/adapters/rate-limit/postgres.ts` (spec 22.3).
 *
 * Same rules: ONE atomic upsert (never read-modify-write — two requests racing
 * for the last slot must serialise in the database), the `case` that resets an
 * expired window inline, the database's `now()` as the single clock, and
 * fail-open on any store error (a database blip must not 429 the app).
 */

const rateLimitTable = schema.rateLimit;

/** `now() + windowMs`, computed in the database. Numbers interpolate safely; Dates do not. */
function expiryFor(rule: RateLimitRule) {
  return sql`now() + make_interval(secs => ${rule.windowMs} / 1000.0)`;
}

export function createPostgresRateLimitAdapter(db: Db): RateLimitAdapter {
  const log = new Logger("RateLimit");

  return {
    async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      try {
        const rows = await db
          .insert(rateLimitTable)
          .values({ key, count: 1, expiresAt: expiryFor(rule) })
          .onConflictDoUpdate({
            target: rateLimitTable.key,
            set: {
              count: sql`case when "rate_limit"."expiresAt" <= now() then 1 else "rate_limit"."count" + 1 end`,
              expiresAt: sql`case when "rate_limit"."expiresAt" <= now() then excluded."expiresAt" else "rate_limit"."expiresAt" end`,
            },
          })
          .returning({ count: rateLimitTable.count, expiresAt: rateLimitTable.expiresAt });

        const row = rows[0];
        if (!row) return allowOnError(rule);
        return decide(row.count, row.expiresAt.getTime(), rule);
      } catch (err) {
        // Fail open — a database blip must not 429 the entire application.
        log.warn(`consume failed, allowing request: ${String(err)}`);
        return allowOnError(rule);
      }
    },

    async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      try {
        const rows = await db
          .select({ count: rateLimitTable.count, expiresAt: rateLimitTable.expiresAt })
          .from(rateLimitTable)
          .where(eq(rateLimitTable.key, key))
          .limit(1);

        const row = rows[0];
        // Absent OR expired reads as a fresh window — the same equivalence the
        // upsert's `case` enforces on the write path. decideNext, not decide.
        if (!row || row.expiresAt.getTime() <= Date.now()) {
          return decideNext(0, Date.now() + rule.windowMs, rule);
        }
        return decideNext(row.count, row.expiresAt.getTime(), rule);
      } catch (err) {
        log.warn(`peek failed, allowing request: ${String(err)}`);
        return allowOnError(rule);
      }
    },

    async reset(key: string): Promise<void> {
      try {
        await db.delete(rateLimitTable).where(eq(rateLimitTable.key, key));
      } catch (err) {
        // A failed reset only leaves a stale counter that expires on its own.
        // It must never break the sign-in it follows.
        log.warn(`reset failed: ${String(err)}`);
      }
    },

    async prune(): Promise<number> {
      try {
        const deleted = await db
          .delete(rateLimitTable)
          .where(
            sql`${rateLimitTable.key} in (select "key" from "rate_limit" where "expiresAt" <= now() limit 50000)`,
          )
          .returning({ key: rateLimitTable.key });
        return deleted.length;
      } catch (err) {
        log.warn(`prune failed: ${String(err)}`);
        return 0;
      }
    },
  };
}
