import {
  decide,
  decideNext,
  type RateLimitAdapter,
  type RateLimitDecision,
  type RateLimitRule,
} from "@repo/contracts";

/**
 * In-process rate-limit store — the Nest twin of the web app's
 * `src/lib/adapters/rate-limit/memory.ts` (spec 22.3).
 *
 * Same semantics: fixed window, lazy expiry, sweep past 10k keys (the bound is
 * the memory-exhaustion story — keys derive from client identity). Correct for
 * a single-process API; `postgres` is the multi-instance answer.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const SWEEP_THRESHOLD = 10_000;

function sweep(buckets: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function live(buckets: Map<string, Bucket>, key: string, now: number): Bucket | null {
  const bucket = buckets.get(key);
  if (!bucket) return null;
  if (bucket.resetAt <= now) {
    buckets.delete(key);
    return null;
  }
  return bucket;
}

export function createMemoryRateLimitAdapter(): RateLimitAdapter {
  const buckets = new Map<string, Bucket>();

  return {
    async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      const now = Date.now();
      const existing = live(buckets, key, now);

      if (existing) {
        existing.count += 1;
        return decide(existing.count, existing.resetAt, rule);
      }

      if (buckets.size >= SWEEP_THRESHOLD) sweep(buckets, now);

      const resetAt = now + rule.windowMs;
      buckets.set(key, { count: 1, resetAt });
      return decide(1, resetAt, rule);
    },

    async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      const now = Date.now();
      const existing = live(buckets, key, now);
      // decideNext, not decide — this judges the hit that has not happened yet.
      return existing
        ? decideNext(existing.count, existing.resetAt, rule)
        : decideNext(0, now + rule.windowMs, rule);
    },

    async reset(key: string): Promise<void> {
      buckets.delete(key);
    },

    async prune(): Promise<number> {
      return 0;
    },
  };
}
