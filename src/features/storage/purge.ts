import type { JobHandler } from "@/lib/adapters/jobs";
import { storage } from "@/lib/adapters/storage";
import { createLogger } from "@/lib/logger";
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
 */
export const storagePurgeHandler: JobHandler<"storage.purge"> = async () => {
  const cutoff = retentionCutoff();
  const rows = await listPurgeableFiles(cutoff);

  let purged = 0;
  for (const row of rows) {
    await storage.delete(row.key);
    await hardDeleteFile(row.id);
    purged += 1;
  }

  log.info("purged soft-deleted files", { purged, olderThanDays: RETENTION_DAYS });
};
