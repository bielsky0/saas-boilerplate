/**
 * Soft-delete retention policy (spec 11.3) — the Nest twin of the web app's
 * `features/admin/retention.ts` (faza 2.6: the rules move with the panel).
 *
 * Deleting an account or organization from the admin panel (§6.2) sets
 * `deletedAt` rather than removing rows. Access is already revoked without any
 * job running (the engine's `session.create.before` hook blocks sign-in for a
 * soft-deleted user, `getSession` resolves their live sessions to null, and
 * every tenant-scoped read filters `isNull(deletedAt)`) — retention is about
 * data lifecycle, not access.
 *
 * THE PURGE JOB IS STILL UNBUILT. Building it means adding a `retention.purge`
 * job name, a handler beside the jobs registry (`job.prune` is the worked
 * example of a cron-shaped, idempotent task), and a daily self-enqueue.
 *
 * ⚠️ HARD BLOCKER FOR WHOEVER BUILDS IT — do not rediscover this at 2am:
 *
 *   `organization.createdByUserId` is declared `references(() => user.id,
 *   { onDelete: "restrict" })`.
 *
 * That FK makes a hard DELETE of any user who has EVER created an organization
 * fail at the database, even if that org is itself soft-deleted or long gone.
 * The purge therefore needs its own migration making `createdByUserId`
 * nullable with `onDelete: "set null"`, plus a decision on ordering (purge
 * orgs before their creators, or null the column first).
 *
 * `audit_log` is deliberately NOT purged with its subjects — `actorUserId`
 * and `organizationId` are both `onDelete: "set null"` and the actor/target
 * labels are snapshots, precisely so the trail survives erasure of the people
 * and tenants it names. Audit-log retention is a separate policy question:
 * §6.4 notes the log may need a LONGER window than the data it describes,
 * which is why it cannot simply inherit `RETENTION_DAYS`.
 *
 * WHEN THE PURGE JOB IS BUILT, it must audit what it deletes (§6.4): one
 * `retention.purge` entry PER ORGANIZATION with a count, using `SYSTEM_ACTOR`
 * — the shape the storage purge already writes — never one entry per deleted
 * record.
 */

/** Days a soft-deleted user/organization is retained before permanent purge. */
export const RETENTION_DAYS = 30;

/** The cutoff a purge job would compare `deletedAt` against. */
export function retentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff;
}
