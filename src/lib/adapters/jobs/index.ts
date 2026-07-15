/**
 * Background-jobs adapter (spec 1.2, 12 — pluggable async/scheduler backend).
 *
 * Defines the contract for enqueuing async work, idempotent handlers, retry
 * with backoff, and cron-like recurring tasks (email sequences, webhook
 * processing, retention cleanup, AI jobs). Reference implementation wraps
 * Inngest or an equivalent scheduler.
 */

export {};
