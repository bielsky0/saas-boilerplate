import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { job } from "@/lib/db/schema";
import { createLogger, runWithLogContext } from "@/lib/logger";
import type {
  DrainResult,
  EnqueueOptions,
  JobName,
  JobPayloads,
  JobRegistry,
  JobWriter,
  JobsAdapter,
} from "./contract";

/**
 * Postgres-backed job queue (spec 12) — the ONLY file that touches the `job`
 * table.
 *
 * Chosen over a hosted scheduler because enqueue is then a plain INSERT, which
 * can join the caller's transaction (see the contract header's outbox note). It
 * also means retry-with-backoff is exercisable in CI with no external service,
 * which is what spec 14.1's "simulate a provider outage" test needs.
 */

/**
 * How long a claim is honored before the job is assumed abandoned. Must exceed
 * any plausible handler duration (a Resend call is ~1s; the ceiling is a route's
 * max duration), because a job still running at this point gets claimed twice.
 */
const CLAIM_TIMEOUT_MS = 5 * 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_FACTOR = 4;
const RETRY_MAX_MS = 60 * 60_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BUDGET_MS = 10_000;
const MAX_ERROR_LENGTH = 2000;

const log = createLogger("jobs");

/**
 * Exponential backoff with FULL JITTER:
 *   attempt 1 → ~30s, 2 → ~2m, 3 → ~8m, 4 → ~32m, 5 → ~1h (capped).
 *
 * The jitter is not decoration. When a provider outage ends, every job queued
 * during it becomes due at the same instant; a deterministic backoff then
 * re-DDoSes the provider that just came back, turning a recovery into a second
 * outage.
 */
function backoffMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_MS * RETRY_FACTOR ** (attempt - 1), RETRY_MAX_MS);
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

type JobRow = typeof job.$inferSelect;

/**
 * Claim a batch of due jobs.
 *
 * The transaction is SHORT ON PURPOSE: it holds row locks only long enough to
 * stamp them, then commits. Handlers run OUTSIDE it — a handler makes an HTTP
 * call to an email provider, and holding a pooled connection across that is the
 * deadlock `features/admin/audit.ts` documents for engine calls, with a provider
 * outage as the trigger instead of a nested pool checkout. On the small default
 * `postgres()` pool, a provider timing out for 30s plus a burst of jobs would
 * exhaust the pool and wedge the entire app, not just the queue.
 *
 * `status IN ('pending','running')` is not a typo. 'running' with `runAt` in the
 * past means the worker that claimed it died: `runAt` is the visibility timeout,
 * so the claim IS the reaper and no separate sweeper exists.
 *
 * `lte(job.runAt, now)` rather than a raw `sql` template, for the reason
 * `features/billing/webhooks.ts` documents on its watermark: a Date interpolated
 * into `sql` bypasses the column's type encoder and reaches the driver as a raw
 * Date, which it cannot serialize.
 */
async function claim(limit: number): Promise<JobRow[]> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(job)
      .where(and(inArray(job.status, ["pending", "running"]), lte(job.runAt, now)))
      .orderBy(job.runAt)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];

    await tx
      .update(job)
      .set({
        status: "running",
        claimedAt: now,
        runAt: new Date(now.getTime() + CLAIM_TIMEOUT_MS),
        attempts: sql`${job.attempts} + 1`,
        updatedAt: now,
      })
      .where(
        inArray(
          job.id,
          rows.map((r) => r.id),
        ),
      );

    // `attempts` was incremented in the DB; reflect it for JobContext.
    return rows.map((r) => ({ ...r, attempts: r.attempts + 1 }));
  });
}

/**
 * Terminal success.
 *
 * `payload` is SCRUBBED here. An `email.send` for an invitation carries the raw,
 * working invitation link, which `invitation.tokenHash` deliberately never stores
 * ("a database leak cannot yield working links"). Queuing it would silently undo
 * that promise for the row's whole lifetime; scrubbing on success cuts the window
 * to the seconds between commit and drain. Dead-lettered rows keep their payload
 * because a requeue needs it, and `job.prune` sweeps them.
 */
async function markDone(row: JobRow): Promise<void> {
  const now = new Date();
  await db
    .update(job)
    .set({ status: "done", payload: {}, completedAt: now, lastError: null, updatedAt: now })
    .where(eq(job.id, row.id));
}

/** Terminal failure or a scheduled retry, depending on the attempt budget. */
async function markFailed(row: JobRow, error: unknown): Promise<{ deadLettered: boolean }> {
  const now = new Date();
  const message = error instanceof Error ? error.message : String(error);
  const deadLettered = row.attempts >= row.maxAttempts;
  await db
    .update(job)
    .set({
      status: deadLettered ? "failed" : "pending",
      runAt: deadLettered ? row.runAt : new Date(now.getTime() + backoffMs(row.attempts)),
      lastError: message.slice(0, MAX_ERROR_LENGTH),
      completedAt: deadLettered ? now : null,
      updatedAt: now,
    })
    .where(eq(job.id, row.id));
  return { deadLettered };
}

export const postgresJobsAdapter: JobsAdapter = {
  async enqueue<N extends JobName>(
    writer: JobWriter,
    name: N,
    payload: JobPayloads[N],
    options?: EnqueueOptions,
  ): Promise<void> {
    await writer
      .insert(job)
      .values({
        name,
        payload,
        dedupeKey: options?.dedupeKey ?? null,
        runAt: options?.runAt ?? new Date(),
        ...(options?.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
      })
      // The webhooks.ts pattern: a duplicate key adds no row and is not an error.
      // Combined with `writer` being the caller's tx, a rolled-back effect takes
      // its job with it.
      .onConflictDoNothing({ target: [job.dedupeKey] });
  },

  /**
   * Check if a dedupe key has already been used (exists in job table).
   * Returns true if the key exists (already enqueued), false otherwise.
   */
  async isDeduped(dedupeKey: string): Promise<boolean> {
    if (!dedupeKey) return false;
    const [row] = await db
      .select({ id: job.id })
      .from(job)
      .where(eq(job.dedupeKey, dedupeKey))
      .limit(1);
    return !!row;
  },

  async drain(registry: JobRegistry, opts): Promise<DrainResult> {
    const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;
    const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS;
    const deadline = Date.now() + budgetMs;
    const result: DrainResult = { claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 };

    // Loop batches rather than draining once: handlers enqueue children
    // (onboarding.step → email.send), and a single-batch drain would strand the
    // child until the next cron tick.
    while (Date.now() < deadline) {
      const rows = await claim(batchSize);
      if (rows.length === 0) break;
      result.claimed += rows.length;

      for (const row of rows) {
        const handler = registry[row.name as JobName] as
          ((payload: unknown, ctx: unknown) => Promise<void>) | undefined;

        // THE one place job log context is seeded (spec 15.3). Everything the
        // handler logs — and everything IT calls — inherits job/name/attempt from
        // here, so no handler has to thread an id through its own signature. A job
        // has no request scope, so this ALS is what `requestLogger` is for a
        // request: the same fields, arriving by the only route available.
        await runWithLogContext(
          { job: row.id, name: row.name, attempt: row.attempts },
          async () => {
            try {
              if (!handler) {
                // A name with no handler is a deploy skew (a queued job from a newer
                // version), not a transient fault. Let it retry and dead-letter: the
                // row survives for diagnosis either way.
                throw new Error(`No handler registered for job "${row.name}"`);
              }
              await handler(row.payload, {
                id: row.id,
                name: row.name as JobName,
                attempt: row.attempts,
                maxAttempts: row.maxAttempts,
              });
              await markDone(row);
              result.succeeded += 1;
            } catch (error) {
              const { deadLettered } = await markFailed(row, error);
              if (deadLettered) {
                result.deadLettered += 1;
                // §12.2 observability: dead-letter is the one transition nobody is
                // watching for, so it gets the loud line.
                log.error("DEAD LETTER", { err: error });
              } else {
                result.retried += 1;
                log.warn("retry", { maxAttempts: row.maxAttempts, err: error });
              }
            }
          },
        );
      }
    }

    return result;
  },
};
