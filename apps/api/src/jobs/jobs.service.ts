import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { and, desc, eq, inArray, like, lte, sql } from "drizzle-orm";

import { job } from "@repo/db";
import type { Db } from "@repo/db";
import type {
  DrainResult,
  EnqueueOptions,
  JobName,
  JobPayloads,
  JobRegistry,
  JobWriter,
} from "@repo/contracts";
import { DB } from "../db/db.module";
import { JOB_REGISTRY } from "./registry-token";
import { pruneTerminalJobs } from "./prune";
import { insertJob } from "./queue";
import { kickDrain, setDrainHook } from "./runner";

/**
 * Postgres-backed job queue (spec 12) — the Nest port of the web app's
 * `src/lib/adapters/jobs/postgres.ts` + `src/features/jobs/data.ts`.
 *
 * Same table, same semantics, same constants: enqueue is a plain INSERT that
 * joins the caller's transaction (the outbox); drain claims batches
 * (`FOR UPDATE SKIP LOCKED`), runs handlers OUTSIDE the claim transaction (a
 * handler makes HTTP calls — holding a pooled connection across that is the
 * deadlock the web module documents), and retries with jittered backoff
 * (`30s·4^(n-1)`, capped at 1h) before dead-lettering.
 *
 * `runAt` doubles as the visibility timeout: `pending`/`running` with
 * `runAt` in the past is claimable, so the claim IS the reaper and no sweeper
 * exists. Handlers must be idempotent (at-least-once).
 */

const CLAIM_TIMEOUT_MS = 5 * 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_FACTOR = 4;
const RETRY_MAX_MS = 60 * 60_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BUDGET_MS = 10_000;
const MAX_ERROR_LENGTH = 2000;

export type JobRow = typeof job.$inferSelect;

/**
 * Exponential backoff with FULL JITTER:
 *   attempt 1 → ~30s, 2 → ~2m, 3 → ~8m, 4 → ~32m, 5 → ~1h (capped).
 *
 * The jitter is not decoration: when a provider outage ends, every job queued
 * during it becomes due at the same instant; a deterministic backoff then
 * re-DDoSes the provider that just came back.
 */
export function backoffMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_MS * RETRY_FACTOR ** (attempt - 1), RETRY_MAX_MS);
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly log = new Logger("JobsService");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(JOB_REGISTRY) private readonly registry: JobRegistry,
  ) {}

  /** Register the post-enqueue self-drain (see `runner.ts`). */
  onModuleInit(): void {
    setDrainHook(() => this.drainWithOwnRegistry({ budgetMs: DEFAULT_BUDGET_MS }));
  }

  /** Drain with the module registry (cron, dev seam, post-enqueue kick). */
  async drainWithOwnRegistry(opts?: {
    batchSize?: number;
    budgetMs?: number;
  }): Promise<DrainResult> {
    return this.drain(this.registry, opts);
  }

  async enqueue<N extends JobName>(
    writer: JobWriter,
    name: N,
    payload: JobPayloads[N],
    options?: EnqueueOptions,
  ): Promise<void> {
    await insertJob(writer, name, payload as Record<string, unknown>, options);
    // Kicked even when `writer` is an uncommitted tx: the drain runs after the
    // response, by which point the tx resolved. On rollback the row is gone
    // and the drain finds nothing — the whole point of the outbox.
    kickDrain();
  }

  async drain(
    registry: JobRegistry,
    opts?: { batchSize?: number; budgetMs?: number },
  ): Promise<DrainResult> {
    const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;
    const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS;
    const deadline = Date.now() + budgetMs;
    const result: DrainResult = { claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 };

    // Loop batches rather than draining once: handlers enqueue children
    // (onboarding.step → email.send), and a single-batch drain would strand
    // the child until the next tick.
    while (Date.now() < deadline) {
      const rows = await this.claim(batchSize);
      if (rows.length === 0) break;
      result.claimed += rows.length;

      for (const row of rows) {
        const handler = registry[row.name as JobName] as
          ((payload: unknown, ctx: unknown) => Promise<void>) | undefined;
        try {
          if (!handler) {
            // A name with no handler is deploy skew, not a transient fault.
            // Retry and dead-letter: the row survives for diagnosis either way.
            throw new Error(`No handler registered for job "${row.name}"`);
          }
          await handler(row.payload, {
            id: row.id,
            name: row.name as JobName,
            attempt: row.attempts,
            maxAttempts: row.maxAttempts,
          });
          await this.markDone(row);
          result.succeeded += 1;
        } catch (error) {
          const { deadLettered } = await this.markFailed(row, error);
          if (deadLettered) {
            result.deadLettered += 1;
            // §12.2 observability: dead-letter is the one transition nobody
            // watches for, so it gets the loud line.
            this.log.error(
              `DEAD LETTER job=${row.id} name=${row.name} attempt=${row.attempts}`,
              error as Error,
            );
          } else {
            result.retried += 1;
            this.log.warn(
              `retry job=${row.id} name=${row.name} attempt=${row.attempts}/${row.maxAttempts}: ${String(error)}`,
            );
          }
        }
      }
    }

    return result;
  }

  /**
   * Claim a batch of due jobs. The transaction is SHORT ON PURPOSE: it holds
   * row locks only long enough to stamp them, then commits.
   */
  private async claim(limit: number): Promise<JobRow[]> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
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

      return rows.map((r) => ({ ...r, attempts: r.attempts + 1 }));
    });
  }

  /**
   * Terminal success. `payload` is SCRUBBED: an `email.send` for an invitation
   * carries the raw, working link, which `invitation.tokenHash` deliberately
   * never stores. Dead-lettered rows keep theirs (a requeue needs it) and
   * `job.prune` sweeps them.
   */
  private async markDone(row: JobRow): Promise<void> {
    const now = new Date();
    await this.db
      .update(job)
      .set({ status: "done", payload: {}, completedAt: now, lastError: null, updatedAt: now })
      .where(eq(job.id, row.id));
  }

  /** Terminal failure or a scheduled retry, depending on the attempt budget. */
  private async markFailed(row: JobRow, error: unknown): Promise<{ deadLettered: boolean }> {
    const now = new Date();
    const message = error instanceof Error ? error.message : String(error);
    const deadLettered = row.attempts >= row.maxAttempts;
    await this.db
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

  // ─── Observability + retention (spec 12.2) ────────────────────────────────

  /**
   * Newest-first jobs, narrowed by dedupe-key prefix and/or recipient.
   *
   * The `to` filter reads `payload->>'to'` — it matches pending and
   * dead-lettered sends, not completed ones (the success path scrubs the
   * payload it reads). Use `id` after the scrub.
   */
  async listJobs(opts?: {
    dedupeKeyPrefix?: string;
    to?: string;
    id?: string;
    limit?: number;
  }): Promise<JobRow[]> {
    const filters = [
      opts?.dedupeKeyPrefix ? like(job.dedupeKey, `${opts.dedupeKeyPrefix}%`) : undefined,
      opts?.to ? sql`${job.payload}->>'to' = ${opts.to}` : undefined,
      opts?.id ? eq(job.id, opts.id) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    return this.db
      .select()
      .from(job)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(job.createdAt))
      .limit(opts?.limit ?? 100);
  }

  /**
   * Pull scheduled jobs into the present. TEST SEAM ONLY — the dev route that
   * calls this is 404 in production. A SCOPE IS REQUIRED (prefix or ids): the
   * E2E suite runs fullyParallel against one shared database, so an unscoped
   * fast-forward would yank another spec's day-3 job into the present.
   */
  async fastForwardJobs(scope: { dedupeKeyPrefix?: string; ids?: string[] }): Promise<number> {
    const scopeFilter = scope.dedupeKeyPrefix
      ? like(job.dedupeKey, `${scope.dedupeKeyPrefix}%`)
      : scope.ids?.length
        ? inArray(job.id, scope.ids)
        : null;
    if (!scopeFilter) return 0;

    const rows = await this.db
      .update(job)
      .set({ runAt: new Date(), updatedAt: new Date() })
      .where(and(eq(job.status, "pending"), scopeFilter))
      .returning({ id: job.id });
    return rows.length;
  }

  /** Delete terminal rows past the retention window. */
  async pruneTerminalJobs(): Promise<number> {
    return pruneTerminalJobs(this.db);
  }

  /** Queue depth by status (spec 12.2 — the cheap health signal). */
  async jobStats(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: job.status, count: sql<number>`count(*)::int` })
      .from(job)
      .groupBy(job.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.count]));
  }
}
