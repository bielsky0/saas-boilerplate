import { and, inArray, lt } from "drizzle-orm";

import { job, type Db } from "@repo/db";

/**
 * Terminal-row retention (spec 12.1 cleanup) — standalone so both the
 * `job.prune` registry entry and `JobsService` share it without a DI cycle
 * (the registry is built from services; a service method here would need the
 * registry's owner injected back).
 */

/** Terminal rows older than this are pruned. Bounds `payload` exposure. */
export const JOB_RETENTION_DAYS = 7;

/** Delete terminal rows past the retention window. */
export async function pruneTerminalJobs(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 86_400_000);
  const rows = await db
    .delete(job)
    .where(and(inArray(job.status, ["done", "failed"]), lt(job.completedAt, cutoff)))
    .returning({ id: job.id });
  return rows.length;
}
