import {
  decide,
  decideNext,
  type RateLimitAdapter,
  type RateLimitDecision,
  type RateLimitRule,
} from "./contract";

/**
 * In-process rate-limit store (spec 22.3) — the default provider.
 *
 * Correct for local development, CI, and any single-process deployment (one
 * container, one `next start`). ⚠️ On N instances each counts separately, so the
 * effective limit is N x the configured limit; that is what `postgres` is for,
 * and it is documented at the RATE_LIMIT_PROVIDER env var rather than only here.
 *
 * Cached on `globalThis` for the same reason `src/lib/db/index.ts` caches its
 * client: without it, Next's hot reload discards every counter on each module
 * reload, and the limiter becomes untestable in `pnpm dev` — you would never
 * reach attempt 5, because the map keeps starting over.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets: Map<string, Bucket> | undefined;
};

const buckets: Map<string, Bucket> = globalForRateLimit.rateLimitBuckets ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.rateLimitBuckets = buckets;
}

/**
 * Above this many live keys, a write sweeps expired entries before inserting.
 *
 * ⚠️ NOT housekeeping — this is the whole safety story of a memory limiter.
 * Every distinct key allocates, and keys are derived from client identity, so an
 * attacker rotating IPs or tokens creates one entry per request. Without a bound,
 * the limiter is itself the memory-exhaustion DoS it was added to prevent.
 */
const SWEEP_THRESHOLD = 10_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Read the live bucket, treating an expired one as absent. */
function live(key: string, now: number): Bucket | null {
  const bucket = buckets.get(key);
  if (!bucket) return null;
  if (bucket.resetAt <= now) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

export const memoryRateLimitAdapter: RateLimitAdapter = {
  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = live(key, now);

    if (existing) {
      existing.count += 1;
      return decide(existing.count, existing.resetAt, rule);
    }

    if (buckets.size >= SWEEP_THRESHOLD) sweep(now);

    const resetAt = now + rule.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return decide(1, resetAt, rule);
  },

  async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = live(key, now);
    // decideNext, not decide — this judges the hit that has not happened yet.
    return existing
      ? decideNext(existing.count, existing.resetAt, rule)
      : decideNext(0, now + rule.windowMs, rule);
  },

  async reset(key: string): Promise<void> {
    buckets.delete(key);
  },

  /**
   * A no-op that returns 0, and that is not a bug to fix: expiry happens lazily
   * on read (`live`) and in bulk at SWEEP_THRESHOLD, so there is nothing left for
   * a scheduled prune to do. The `ratelimit.prune` job still runs — it just has
   * no work on a memory deployment, which is why it logs 0 rather than nothing.
   */
  async prune(): Promise<number> {
    return 0;
  },
};
