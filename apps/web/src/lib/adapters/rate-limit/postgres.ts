import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { rateLimit as rateLimitTable } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import {
  allowOnError,
  decide,
  decideNext,
  type RateLimitAdapter,
  type RateLimitDecision,
  type RateLimitRule,
} from "./contract";

/**
 * Shared rate-limit store (spec 22.3) — the provider to select on any deploy that
 * runs more than one instance, because it is the only one where N instances agree.
 *
 * ─── ONE STATEMENT, NEVER A READ-MODIFY-WRITE ───────────────────────────────
 *
 * `consume` is a single upsert. That is the whole correctness argument: two
 * requests racing toward the last slot of a window must serialise against each
 * other, and only the database can make them. A select-then-update would let both
 * read 4, both write 5, and both be allowed — which is precisely the race §5.6
 * calls out for quota counters, arriving here for the same reason.
 *
 * The `case` in the conflict branch is what makes an EXPIRED row reset rather
 * than increment, so the read path needs no reaper — the same trick `job.runAt`
 * plays by doubling as a visibility timeout. `prune` exists only to reclaim disk
 * from keys that stopped being hit, not to keep the counting correct.
 *
 * ─── `now()` IS THE DATABASE'S CLOCK, DELIBERATELY ──────────────────────────
 *
 * Every timestamp here is computed server-side rather than passed in from Node.
 * The entire reason this provider exists is that multiple app instances must
 * agree on one counter, and they can only agree if they also agree on the clock.
 * Interpolating `new Date()` would reintroduce per-instance skew into the one
 * component chosen specifically to eliminate it — and would hit the encoder
 * problem `adapters/jobs/postgres.ts` documents on its watermark.
 */

const log = createLogger("rate-limit");

/** `now() + windowMs`, computed in the database. Numbers interpolate safely; Dates do not. */
function expiryFor(rule: RateLimitRule) {
  return sql`now() + make_interval(secs => ${rule.windowMs} / 1000.0)`;
}

export const postgresRateLimitAdapter: RateLimitAdapter = {
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
      // Fail open — see the contract header. A database blip must not 429 the
      // entire application.
      log.warn("consume failed, allowing request", { err });
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
      // upsert's `case` enforces on the write path.
      // decideNext, not decide — this judges the hit that has not happened yet.
      if (!row || row.expiresAt.getTime() <= Date.now()) {
        return decideNext(0, Date.now() + rule.windowMs, rule);
      }
      return decideNext(row.count, row.expiresAt.getTime(), rule);
    } catch (err) {
      log.warn("peek failed, allowing request", { err });
      return allowOnError(rule);
    }
  },

  async reset(key: string): Promise<void> {
    try {
      await db.delete(rateLimitTable).where(eq(rateLimitTable.key, key));
    } catch (err) {
      // A failed reset only leaves a stale counter that expires on its own. It
      // must never break the sign-in it follows.
      log.warn("reset failed", { err });
    }
  },

  /**
   * Bounded per call: a deploy that accumulated millions of dead keys would
   * otherwise take one long lock on the table the request path writes to on every
   * request. The `ratelimit.prune` job runs hourly, so a backlog drains across
   * runs instead of in one stall.
   */
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
      log.warn("prune failed", { err });
      return 0;
    }
  },
};
