import type { JobHandler } from "@/lib/adapters/jobs";
import { JOB_RETENTION_DAYS, pruneTerminalJobs } from "./data";

/**
 * Housekeeping job (spec 12.1 — "czyszczenie danych po okresie retencji").
 *
 * Deletes terminal job rows past the retention window. This is not only tidiness:
 * a dead-lettered `email.send` keeps its `payload`, which for an invitation holds
 * a raw, working invite link (see the `job` table header). Pruning is what bounds
 * that exposure for rows the success-path scrub never reached.
 *
 * Idempotent by nature — deleting an already-deleted row is a no-op — so a
 * re-claim after a visibility timeout is harmless.
 */
export const jobPruneHandler: JobHandler<"job.prune"> = async () => {
  const deleted = await pruneTerminalJobs();
  console.log(`[jobs] pruned ${deleted} terminal job(s) older than ${JOB_RETENTION_DAYS}d`);
};
