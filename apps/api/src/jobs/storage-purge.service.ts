import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, lt } from "drizzle-orm";

import { file, type Db } from "@repo/db";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { recordAudit, SYSTEM_ACTOR } from "../organizations/audit";

/**
 * File retention purge (spec 21.4) — the Nest twin of web's
 * `features/storage/purge.ts`.
 *
 * Two stages: `deletedAt` hides the file at once; this cron-shaped job, past
 * the retention window, deletes the OBJECT from the bucket and then the row.
 * Object-first-then-row: dying between the two leaves a still-purgeable row
 * (object delete is idempotent on a gone key); row-first would strand the
 * object forever with nothing pointing at it.
 *
 * AUDIT (spec 6.4): one row PER ORGANIZATION per run, with a count — never
 * one per file. `organizationId: null` collects personal-account files.
 *
 * STORAGE SCOPE (faza 2.4 owns the rest): the object delete resolves through
 * the same provider switch as web (`none` throws `NOT_CONFIGURED`, like web's
 * null adapter). Full S3 wiring lands with the storage port; until then a
 * `none` deployment dead-letters this job exactly like web does today.
 */

/** Days a soft-deleted file is retained before permanent purge. */
export const STORAGE_RETENTION_DAYS = 30;

function retentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - STORAGE_RETENTION_DAYS);
  return cutoff;
}

export class StorageNotConfiguredError extends Error {
  readonly code = "NOT_CONFIGURED";
  constructor() {
    super(
      "STORAGE_PROVIDER=none: no object storage is configured. File purge needs the faza 2.4 storage port.",
    );
  }
}

@Injectable()
export class StoragePurgeService {
  private readonly log = new Logger("StoragePurgeService");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async handlePurge(): Promise<void> {
    const cutoff = retentionCutoff();
    const rows = await this.db
      .select({
        id: file.id,
        key: file.key,
        organizationId: file.organizationId,
        accountId: file.accountId,
      })
      .from(file)
      .where(and(lt(file.deletedAt, cutoff)))
      .limit(100);

    let purged = 0;
    const perOwner = new Map<string | null, number>();

    for (const row of rows) {
      await this.deleteObject(row.key);
      await this.db.delete(file).where(eq(file.id, row.id));
      purged += 1;
      perOwner.set(row.organizationId, (perOwner.get(row.organizationId) ?? 0) + 1);
    }

    // After the deletions, not interleaved: the audit entry asserts a
    // completed purge, and a count written before the work could overstate it
    // if the job dies mid-loop.
    for (const [organizationId, fileCount] of perOwner) {
      await this.db.transaction(async (tx) => {
        await recordAudit(tx, {
          action: "retention.purge",
          actor: SYSTEM_ACTOR,
          organizationId,
          targetType: "organization",
          targetId: organizationId ?? "personal",
          targetLabel: organizationId ?? "personal accounts",
          metadata: { fileCount, olderThanDays: STORAGE_RETENTION_DAYS, resource: "file" },
        });
      });
    }

    this.log.log(
      `purged soft-deleted files purged=${purged} olderThanDays=${STORAGE_RETENTION_DAYS}`,
    );
  }

  private async deleteObject(key: string): Promise<void> {
    // Faza 2.4 wires the S3 delete here. Until then every provider selection
    // fails loudly — same as web's `none` adapter throwing NOT_CONFIGURED.
    this.log.debug(
      `purge object delete deferred key=${key} provider=${this.config.STORAGE_PROVIDER}`,
    );
    throw new StorageNotConfiguredError();
  }
}
