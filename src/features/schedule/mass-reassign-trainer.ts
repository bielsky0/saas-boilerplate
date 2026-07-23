import { and, eq, gte } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { classSession } from "@/lib/db/schema";
import { SQLSTATE_EXCLUSION_VIOLATION, sqlStateOf } from "@/lib/db/sql-error";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Mass trainer reassign (langlion US-21.3, §2.11).
 *
 * Changes the trainer for multiple future sessions at once. Each session is
 * updated in its own savepoint — if the new trainer has a conflict on one
 * specific session, only that session is skipped, the rest proceed.
 *
 * LOCK ORDER: class_session first for each session within its savepoint.
 */

export interface MassReassignReport {
  total: number;
  updated: number;
  skippedTrainerConflict: number;
}

export interface MassReassignInput {
  organizationId: string;
  /** The trainer whose future sessions will be reassigned. */
  fromTrainerId: string;
  /** The trainer to assign to all future sessions. */
  targetTrainerId: string;
  actor: AuditActor;
  /** Optional: explicit list of session IDs. If absent, reads all future sessions
   * for `fromTrainerId`. */
  sessionIds?: string[];
  now?: Date;
}

/**
 * Mass reassign trainer for future sessions (US-21.3).
 * Returns a report of updated/skipped counts.
 */
export async function massReassignTrainer(
  tx: TenantDb,
  input: MassReassignInput,
): Promise<MassReassignReport> {
  const now = input.now ?? new Date();

  // 1. Determine the sessions to update.
  const sessionIds = input.sessionIds ?? (
    await tx
      .select({ id: classSession.id })
      .from(classSession)
      .where(
        and(
          eq(classSession.organizationId, input.organizationId),
          eq(classSession.trainerId, input.fromTrainerId),
          eq(classSession.status, "scheduled"),
          gte(classSession.startTime, now),
        ),
      )
  ).map((s) => s.id);

  let updated = 0;
  let skippedTrainerConflict = 0;

  // 2. Each session in its own savepoint (US-21.3/AC1).
  for (const sessionId of sessionIds) {
    try {
      await tx.transaction(async (savepoint) => {
        // Lock session within the savepoint.
        const [session] = await savepoint
          .select({ id: classSession.id })
          .from(classSession)
          .where(
            and(
              eq(classSession.id, sessionId),
              eq(classSession.organizationId, input.organizationId),
            ),
          )
          .limit(1)
          .for("update");

        if (!session) return; // Session was cancelled in the meantime, skip.

        await savepoint
          .update(classSession)
          .set({
            trainerId: input.targetTrainerId,
            isManuallyAdjusted: true,
            updatedAt: now,
          })
          .where(
            and(
              eq(classSession.id, sessionId),
              eq(classSession.organizationId, input.organizationId),
            ),
          );
      });
      updated += 1;
    } catch (error) {
      if (sqlStateOf(error) === SQLSTATE_EXCLUSION_VIOLATION) {
        skippedTrainerConflict += 1;
        continue;
      }
      throw error;
    }
  }

  // 3. Audit — single entry with report in metadata.
  await recordAudit(tx, {
    action: "session.mass_reassign_trainer",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "class_session",
    targetId: input.fromTrainerId,
    targetLabel: input.fromTrainerId,
    metadata: {
      targetTrainerId: input.targetTrainerId,
      updated,
      skippedTrainerConflict,
      total: sessionIds.length,
    },
  });

  return {
    total: sessionIds.length,
    updated,
    skippedTrainerConflict,
  };
}
