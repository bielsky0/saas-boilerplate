import type { JobHandler } from "@/lib/adapters/jobs";
import { storage } from "@/lib/adapters/storage";
import { db } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { recordAudit, SYSTEM_ACTOR } from "@/features/admin/audit";
import { retentionCutoff, RETENTION_DAYS } from "@/features/admin/retention";
import { hardDeleteFile, listPurgeableFiles } from "./data";

const log = createLogger("storage");

/**
 * File retention purge (spec 21.4 — soft-deleted files removed after the window).
 *
 * A file is deleted in two stages: `softDeleteFile` sets `deletedAt` (the app
 * stops showing it at once), and this cron-shaped job, once the retention window
 * has passed, deletes the OBJECT from the bucket and then the row. It reuses the
 * same `retentionCutoff` as account/org retention (§11.3) so there is one window,
 * not a second policy to reason about.
 *
 * Order matters: delete the object first, then the row. If the process dies
 * between the two, the row is still purgeable next run and we retry the object
 * delete — which is a no-op on an already-gone key (adapter tolerates NoSuchKey).
 * Deleting the row first would strand the object forever with nothing left
 * pointing at it. Idempotent throughout, as §12.2 requires of a re-claimable job.
 *
 * AUDIT (spec 6.4): one row PER ORGANIZATION per run, with a count — never one per
 * file. A tenant that soft-deleted 400 files would otherwise get 400 audit entries
 * about objects it can no longer see, burying the membership and billing events
 * its admins actually opened the page for. The per-file detail already exists in
 * the application logs below; the audit trail answers "the system deleted our
 * data, when and how much", which a count answers completely.
 *
 * `recordAudit` is safe to call from here despite running outside a request: its
 * `headers()` capture is wrapped in a try/catch and simply leaves ip/user-agent
 * null in job scope. That is a documented behaviour of the writer, not an accident
 * of this call site — do not add a guard for it.
 */
export const storagePurgeHandler: JobHandler<"storage.purge"> = async () => {
  const cutoff = retentionCutoff();
  const rows = await listPurgeableFiles(cutoff);

  let purged = 0;
  // Owner → files purged. `null` collects personal-account files, which have no
  // organization: they land in the ledger with `organizationId: null`, visible to
  // a super admin and to no tenant, which is correct — no org owned them.
  const perOwner = new Map<string | null, number>();

  for (const row of rows) {
    await storage.delete(row.key);
    await hardDeleteFile(row.id);
    purged += 1;
    perOwner.set(row.organizationId, (perOwner.get(row.organizationId) ?? 0) + 1);
  }

  // After the deletions, not interleaved: the audit entry asserts a completed
  // purge, and a count written before the work could overstate it if the job dies
  // mid-loop. A re-claimed run (§12.2 at-least-once) then purges only what is
  // still purgeable and logs that smaller, truthful count.
  for (const [organizationId, fileCount] of perOwner) {
    await db.transaction(async (tx) => {
      await recordAudit(tx, {
        action: "retention.purge",
        actor: SYSTEM_ACTOR,
        organizationId,
        targetType: "organization",
        targetId: organizationId ?? "personal",
        targetLabel: organizationId ?? "personal accounts",
        metadata: { fileCount, olderThanDays: RETENTION_DAYS, resource: "file" },
      });
    });
  }

  log.info("purged soft-deleted files", { purged, olderThanDays: RETENTION_DAYS });
};
