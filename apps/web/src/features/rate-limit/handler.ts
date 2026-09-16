import { rateLimit } from "@/lib/adapters/rate-limit";
import type { JobHandler } from "@/lib/adapters/jobs";
import { createLogger } from "@/lib/logger";

const log = createLogger("rate-limit");

/**
 * Reclaim expired rate-limit counters (spec 22.3 / 12.1).
 *
 * Unlike `storage.purge`, this job is NOT part of any correctness story: an
 * expired counter is reset by the next `consume` rather than read (see the `case`
 * in the postgres adapter's upsert), so a deployment where this never ran would
 * still rate-limit correctly — it would just accumulate dead rows. That is why it
 * is safe for the memory provider to answer 0 and do nothing.
 *
 * Idempotent by construction, as §12.2 requires of a re-claimable job: deleting
 * already-deleted rows is a no-op, and the adapter bounds each call so a large
 * backlog drains across runs instead of taking one long lock on a table the
 * request path writes to constantly.
 */
export const rateLimitPruneHandler: JobHandler<"ratelimit.prune"> = async () => {
  const pruned = await rateLimit.prune();
  // Zero is the normal, healthy answer on a memory deployment — not a symptom.
  log.info("pruned expired rate-limit counters", { pruned });
};
