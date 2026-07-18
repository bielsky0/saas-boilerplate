import type { db } from "@/lib/db";

/**
 * Background-jobs contract (spec 1.2, 12 — pluggable async/scheduler backend).
 *
 * Feature code depends ONLY on this interface. Concrete adapters live beside this
 * file and are chosen by the factory in `./index.ts`. No provider SDK is imported
 * here.
 *
 * ── THE TRANSACTIONAL OUTBOX, AND WHY `enqueue` TAKES A WRITER ──────────────
 *
 * `enqueue` ALWAYS writes a row through `writer`; the ADAPTER is the thing that
 * drains. The postgres adapter drains by executing the handler locally. A future
 * Inngest adapter would drain by calling `inngest.send()` per row — it would NOT
 * change `enqueue`.
 *
 * This is the whole design, and it is load-bearing. The obvious "simplification"
 * — having an Inngest adapter's `enqueue` call `inngest.send()` directly — looks
 * cleaner and silently destroys atomicity: `inngest.send()` is an HTTP call, so a
 * caller whose transaction later rolls back has already sent the email. The
 * outbox is what lets this contract require `writer` without lying about it.
 *
 * Pass a `tx` and the job commits — or rolls back — WITH your business write.
 * That is what makes `features/billing/webhooks.ts` correct: the enqueue joins
 * the same transaction as the idempotency marker and inherits its exactly-once
 * guarantee for free.
 *
 * ── AT-LEAST-ONCE, NEVER EXACTLY-ONCE ──────────────────────────────────────
 *
 * `runAt` is a visibility timeout (see the `job` table header), so a job whose
 * worker appears to have died is re-claimed. "Appears" is doing real work there:
 * a job that is genuinely still running at CLAIM_TIMEOUT gets claimed a second
 * time. HANDLERS MUST BE IDEMPOTENT (§12.2). A reader who assumes exactly-once
 * will write a handler that double-sends, and it will only show up in production.
 *
 * ── PAYLOADS ARE JSON PRIMITIVES ONLY ──────────────────────────────────────
 *
 * `payload` round-trips through jsonb, which is UNTYPED on the way back: a `Date`
 * goes in and an ISO STRING comes out, with the TypeScript type still cheerfully
 * claiming `Date`. Put ISO strings in, and have every handler zod-parse its
 * payload before touching it (`z.coerce.date()` on the way out). The type here is
 * a convenience for the caller, not a guarantee for the handler.
 */

/**
 * Minimal surface shared by `db` and a transaction handle, so a caller can pass
 * either — the same trick `features/admin/audit.ts` uses for its `Writer`.
 *
 * This couples the contract to Drizzle's `insert` shape, which is a real cost and
 * a deliberate one: the alternative is a hand-rolled interface that fakes an
 * abstraction over exactly one thing. Spec 11.1 asks for portability across
 * Postgres HOSTS, not across ORMs; Drizzle is a repo-wide substrate like `db`.
 */
export type JobWriter = Pick<typeof db, "insert">;

export type JobName =
  | "email.send"
  | "onboarding.step"
  | "billing.notify"
  | "notification.create"
  | "job.prune"
  | "storage.purge";

/**
 * `email.send`'s `template` is `string`, not the email adapter's `TemplateName`:
 * one adapter must not import another's vocabulary. The email handler narrows it
 * with zod, which is where the payload has to be validated anyway.
 */
/**
 * Owner + provenance shared by every billing notification.
 *
 * A `type`, not an `interface`, and that is load-bearing rather than taste: only a
 * type alias gets an implicit index signature, and without one this fails to
 * satisfy the `Record<string, unknown>` that the jsonb column requires. Every
 * payload type here inherits that constraint.
 */
type BillingNotifyOwner = {
  organizationId: string | null;
  accountId: string | null;
  /** The provider event that caused this — also the dedupe key's basis. */
  eventId: string;
};

export interface JobPayloads {
  "email.send": {
    template: string;
    data: Record<string, unknown>;
    to: string;
    name?: string;
    /**
     * The language to render in (spec 16.1), captured at ENQUEUE time.
     *
     * It has to travel in the payload because it cannot be recovered later: this
     * job is drained by cron, with no request, no cookie and no `Accept-Language`
     * — and for the §10.3 sequence, a week after the moment anyone knew who this
     * was for. By then the payload is the only witness.
     *
     * `string`, not the i18n `Locale`, for the same reason `template` is not
     * `TemplateName`: a payload is jsonb and is re-validated on the way out.
     *
     * NOTE the handler's zod schema deliberately treats this as OPTIONAL even
     * though it is required here — see features/emails/handler.ts. Rows enqueued
     * by an older deploy have no `locale`, and they must still send.
     */
    locale: string;
  };
  "onboarding.step": { userId: string; step: string };
  /**
   * Create an in-app notification (spec 23.1). A SEPARATE job from `email.send`
   * for the same business event, deliberately: its own row means its own retry
   * lane, so a dead-lettered email never blocks the in-app copy (spec 23 —
   * channels are independent). `type` is `string`, not the feature's
   * `NotificationType`, for the same reason `email.send`'s `template` is: a
   * payload is jsonb and the handler re-validates it with zod.
   */
  "notification.create": {
    userId: string;
    organizationId: string | null;
    accountId: string | null;
    type: string;
    params: Record<string, string | number>;
    link?: string;
  };
  /**
   * A discriminated union rather than one bag of optionals: `amount` is
   * meaningless for a confirmation and `providerSubscriptionId` for a failure,
   * and optional fields would make both unenforceable.
   */
  "billing.notify": BillingNotifyOwner &
    (
      | { kind: "payment-failed"; amount: number; currency: string }
      | { kind: "subscription-confirmed"; providerSubscriptionId: string }
    );
  "job.prune": Record<string, never>;
  /** Retention purge of soft-deleted files + their objects (spec 21.4). Cron-shaped. */
  "storage.purge": Record<string, never>;
}

export interface EnqueueOptions {
  /** First attempt runs no earlier than this. Default: now. */
  runAt?: Date;
  /**
   * Collapses duplicate enqueues. Unique across ALL jobs, FOREVER — a key that
   * has ever been enqueued cannot be enqueued again, even after the first one
   * completed. See the `job` table header for why that is the useful semantic.
   */
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface JobContext {
  id: string;
  name: JobName;
  /** 1-based; the attempt currently executing. */
  attempt: number;
  maxAttempts: number;
}

export type JobHandler<N extends JobName> = (
  payload: JobPayloads[N],
  ctx: JobContext,
) => Promise<void>;

/** Exhaustive by construction: a JobName with no handler is a compile error. */
export type JobRegistry = { [N in JobName]: JobHandler<N> };

export interface DrainResult {
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
}

export interface JobsAdapter {
  /**
   * Write the job row through `writer`. Pass a `tx` to make the job atomic with
   * your business write; pass `db` when there is no transaction to join (e.g.
   * inside an auth-engine hook, which owns its own connection — audit.ts Rule B).
   */
  enqueue<N extends JobName>(
    writer: JobWriter,
    name: N,
    payload: JobPayloads[N],
    options?: EnqueueOptions,
  ): Promise<void>;

  /**
   * Claim and run due jobs until none are due or `budgetMs` is spent.
   *
   * The registry is passed IN rather than imported: an adapter that imported
   * feature handlers would be a cycle (feature → adapter → feature).
   */
  drain(
    registry: JobRegistry,
    opts?: { batchSize?: number; budgetMs?: number },
  ): Promise<DrainResult>;
}
