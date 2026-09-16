import { and, desc, eq, inArray, like, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { job } from "@/lib/db/schema";

/**
 * Jobs data-access layer (spec 12.2 — observability, retention).
 *
 * The `job` table is a system table with no tenant owner (see its schema header),
 * so these helpers are NOT owner-scoped. Their boundary is the caller's: the cron
 * route's `CRON_SECRET`, or a dev route's NODE_ENV guard. Nothing here may be
 * reached from tenant-scoped feature code.
 */

/** Terminal rows older than this are pruned. Bounds `payload` exposure. */
export const JOB_RETENTION_DAYS = 7;

export type JobRow = typeof job.$inferSelect;

/**
 * Newest-first jobs, narrowed by dedupe-key prefix and/or recipient.
 *
 * The `to` filter reads `payload->>'to'`, which is how a test finds a KEYLESS job
 * (a verification or reset email has no dedupe key by design). Note it only
 * matches while the payload survives: the success path scrubs it, so `to` finds
 * pending and dead-lettered sends, not completed ones.
 */
export async function listJobs(opts?: {
  dedupeKeyPrefix?: string;
  to?: string;
  id?: string;
  limit?: number;
}): Promise<JobRow[]> {
  const filters = [
    opts?.dedupeKeyPrefix ? like(job.dedupeKey, `${opts.dedupeKeyPrefix}%`) : undefined,
    opts?.to ? sql`${job.payload}->>'to' = ${opts.to}` : undefined,
    // The by-id lookup exists because `to` stops matching once a job succeeds —
    // the scrub empties the payload it reads.
    opts?.id ? eq(job.id, opts.id) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(job)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(job.createdAt))
    .limit(opts?.limit ?? 100);
  return rows;
}

/**
 * Pull scheduled jobs into the present. TEST SEAM ONLY — the dev route that calls
 * this is 404 in production.
 *
 * A SCOPE IS REQUIRED — by dedupe-key prefix, or by explicit ids — and that is a
 * correctness constraint, not politeness: the E2E suite runs `fullyParallel`
 * against one shared database with no teardown, so an unscoped fast-forward would
 * yank another spec's day-3 job into the present and fail it, from a different
 * file, nondeterministically.
 *
 * Ids exist as a scope because not every job HAS a dedupe key: a verification or
 * reset email is deliberately keyless (each request must send a fresh mail), so a
 * prefix can never match one. Its id can.
 */
export async function fastForwardJobs(scope: {
  dedupeKeyPrefix?: string;
  ids?: string[];
}): Promise<number> {
  const scopeFilter = scope.dedupeKeyPrefix
    ? like(job.dedupeKey, `${scope.dedupeKeyPrefix}%`)
    : scope.ids?.length
      ? inArray(job.id, scope.ids)
      : null;
  if (!scopeFilter) return 0;

  const rows = await db
    .update(job)
    .set({ runAt: new Date(), updatedAt: new Date() })
    .where(and(eq(job.status, "pending"), scopeFilter))
    .returning({ id: job.id });
  return rows.length;
}

/** Delete terminal rows past the retention window (spec 12.1 cleanup). */
export async function pruneTerminalJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 86_400_000);
  const rows = await db
    .delete(job)
    .where(and(inArray(job.status, ["done", "failed"]), lt(job.completedAt, cutoff)))
    .returning({ id: job.id });
  return rows.length;
}

/** Queue depth by status (spec 12.2 — the cheap health signal). */
export async function jobStats(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: job.status, count: sql<number>`count(*)::int` })
    .from(job)
    .groupBy(job.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}
