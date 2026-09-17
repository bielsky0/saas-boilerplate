import { job, type Db } from "@repo/db";

/**
 * Queue INSERT helpers (spec 12 — the INSERT half of the transactional outbox).
 *
 * Every enqueue in the API goes through here so the row commits — or rolls
 * back — atomically with the caller's business write: pass a `tx` inside a
 * transaction, `db` otherwise. `dedupeKey` is globally unique
 * (`onConflictDoNothing`): a redelivery adds no row and is not an error.
 *
 * Payloads are JSON primitives only (`locale` a plain string captured at
 * enqueue time — the drain has no request to ask). Handlers re-validate with
 * zod on the way out.
 */

/** Minimal surface shared by `db` and a transaction handle. */
export type QueueWriter = Pick<Db, "insert">;

export interface EnqueueOptions {
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export async function insertJob(
  writer: QueueWriter,
  name: string,
  payload: Record<string, unknown>,
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
    // A duplicate key adds no row and is not an error (the webhooks.ts pattern).
    .onConflictDoNothing({ target: [job.dedupeKey] });
}
