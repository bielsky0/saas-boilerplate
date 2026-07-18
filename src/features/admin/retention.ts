/**
 * Soft-delete retention policy (spec 11.3).
 *
 * Deleting an account or organization from the admin panel (§6.2) sets
 * `deletedAt` rather than removing rows. The record stays for the retention
 * window below — recoverable by support, and still visible in the panel — and is
 * then permanently purged.
 *
 * WHAT IS ALREADY TRUE, without any job running:
 *   - a soft-deleted user cannot sign in (the `session.create.before` hook in the
 *     auth adapter), and their live sessions die on the next request (`getSession`
 *     returns null for `deletedAt`);
 *   - a soft-deleted org disappears from every tenant-scoped read, which all
 *     filter `isNull(deletedAt)`.
 * So retention is about data lifecycle, not access. Access is already revoked.
 *
 * THE PURGE JOB IS STILL UNBUILT, but no longer blocked on infrastructure: §12
 * landed, so the queue it needs now exists. Building it means adding a
 * `retention.purge` job name in `src/lib/adapters/jobs/contract.ts`, a handler
 * beside `features/jobs/handler.ts` (`job.prune` is the worked example of a
 * cron-shaped, idempotent task), and enqueuing it from the daily cron in
 * `src/app/api/cron/jobs/route.ts` the same way `job.prune` self-schedules.
 *
 * What remains is a DATA decision, which is why this is still deferred rather than
 * merely unfinished:
 *
 * ⚠️ HARD BLOCKER FOR WHOEVER BUILDS IT — do not rediscover this at 2am:
 *
 *   `organization.createdByUserId` is declared `references(() => user.id,
 *   { onDelete: "restrict" })` (src/lib/db/schema/organizations.ts).
 *
 * That FK makes a hard DELETE of any user who has EVER created an organization
 * fail at the database, even if that org is itself soft-deleted or long gone.
 * Since creating an org is a completely ordinary thing for a user to have done,
 * a naive purge would fail for a large fraction of accounts — and it would fail at
 * the point where GDPR compliance depends on it succeeding.
 *
 * The purge therefore needs its own migration making `createdByUserId` nullable
 * with `onDelete: "set null"`, plus a decision on ordering (purge orgs before
 * their creators, or null the column first). Whoever builds the job makes both
 * calls, and writes the reasoning down beside it.
 *
 * `audit_log` is deliberately NOT purged with its subjects — `actorUserId` and
 * `organizationId` are both `onDelete: "set null"` and the actor/target labels are
 * snapshots, precisely so the trail survives erasure of the people and tenants it
 * names (see the schema header). Audit-log retention/rotation is a separate policy
 * question: §6.4 notes the log may need a LONGER window than the data it
 * describes, which is the reason it cannot simply inherit `RETENTION_DAYS`.
 *
 * WHEN THE PURGE JOB IS BUILT, it must audit what it deletes (§6.4). The worked
 * example already exists: `features/storage/purge.ts` writes one `retention.purge`
 * entry PER ORGANIZATION with a count, using `SYSTEM_ACTOR`, rather than one entry
 * per deleted record. Copy that shape — the reasoning (a tenant's audit page must
 * not be buried under thousands of rows about records it can no longer see) applies
 * identically to users and organizations.
 */

/** Days a soft-deleted user/organization is retained before permanent purge. */
export const RETENTION_DAYS = 30;

/** The cutoff a purge job would compare `deletedAt` against. */
export function retentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff;
}
