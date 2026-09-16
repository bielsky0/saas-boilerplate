import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Background job queue (spec 12 — async work, retry with backoff, cron).
 *
 * TENANT-ISOLATION CARVE-OUT (spec 1.3 / 11.2) — see schema/index.ts.
 * Contrast with `webhook_event`, which carries an owner and needed no carve-out
 * because its marker is only ever written AFTER the owner is resolved. A job has
 * no such guarantee: a cron job (retention purge, weekly reports — §12.1) belongs
 * to no tenant at all, so a NOT NULL XOR CHECK cannot hold. The queue is read by
 * the runner (a system actor) and by admins, never by tenant-scoped feature code:
 * its boundary is CRON_SECRET / requireSuperAdmin(), not an owner filter — the
 * `audit_log` justification exactly. Tenant ids, where they exist, live in
 * `payload`, honest about being data rather than a constraint.
 *
 * DO NOT "fix" this by adding two nullable owner columns without the CHECK, the
 * way `webhook_event` has them WITH one. That shape is isolation theater: it
 * enforces nothing, and the next reader will complete it with the XOR CHECK,
 * which silently breaks every cron job.
 *
 * `dedupeKey` is plainly unique — NOT partial-unique over the non-terminal states.
 * The semantics are "this key is enqueued at most once, EVER", and that is what
 * lets enqueue reuse the webhooks.ts pattern: `.onConflictDoNothing({ target:
 * [job.dedupeKey] })` inside the CALLER'S transaction, so a redelivered or
 * replayed effect adds no row and a rollback takes the job with it. A partial
 * unique over ('pending','running') would let a re-fired trigger enqueue a SECOND
 * welcome after the first COMPLETED — the exact double-send §12.2 forbids.
 * Postgres treats NULLs as distinct, so unlimited keyless jobs coexist and one
 * code path serves both.
 *
 * `runAt` doubles as an SQS-style VISIBILITY TIMEOUT: claiming sets
 * status='running' AND runAt = now() + CLAIM_TIMEOUT, so a worker that dies
 * mid-job becomes claimable again on its own. One predicate, one index, no
 * separate reaper — the claim IS the reaper. The cost is at-least-once delivery;
 * see the contract header in src/lib/adapters/jobs/contract.ts.
 *
 * `payload` is jsonb and is AS SENSITIVE AS ITS MOST SENSITIVE TEMPLATE: an
 * `email.send` for an invitation carries the raw, working invitation link, which
 * `invitation.tokenHash` deliberately never stores. That is why the runner scrubs
 * `payload` on the success transition, cutting exposure to the seconds between
 * commit and drain; dead-lettered rows keep it (you need it to requeue) and are
 * swept by the `job.prune` cron.
 *
 * status: "pending" | "running" | "done" | "failed"   (text, validated in app
 *         code — no pgEnum, per repo convention)
 */
export const job = pgTable(
  "job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    dedupeKey: text("dedupeKey"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("maxAttempts").notNull().default(5),
    /** Next time this job is eligible. Also the visibility timeout while running. */
    runAt: timestamp("runAt").notNull().defaultNow(),
    claimedAt: timestamp("claimedAt"),
    /** Truncated failure message from the LAST failed attempt (§12.2). */
    lastError: text("lastError"),
    /** Set on success and on dead-letter — when the row reached a terminal state. */
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    unique("job_dedupe_key_uq").on(t.dedupeKey),
    // The claim query's index, in its exact predicate order.
    index("job_claim_idx").on(t.status, t.runAt),
    // Backs the observability read (§12.2).
    index("job_name_created_idx").on(t.name, t.createdAt.desc()),
  ],
);
