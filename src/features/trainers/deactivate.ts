import { and, eq } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { membership as membershipTable } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";
import { listFutureSessionsForTrainer } from "./data";

/**
 * Trainer offboarding (langlion §2.11, US-21.1, EPIK 20/AC2).
 *
 * Hard-blocked when the trainer has future, non-cancelled sessions (US-21.1/AC1).
 * Admin must resolve all future sessions first via substitution or mass reassign.
 *
 * ZAŁOŻENIE: user ma dokładnie jedną rolę w organizacji. Offboarding ustawia
 * `membership.status = 'suspended'` na tym jednym membershipie. Jeśli w przyszłości
 * dopuszczone zostanie multi-role (np. trener + recepcja na jednym koncie), trzeba
 * przeprojektować — osobne pole `deletedAt` na `trainer_profile` zamiast blokady
 * całego membershipu. Założenie potwierdzone w modelu danych: boilerplate nie
 * wspiera multi-role (statyczne role, Rozstrzygnięcie #4).
 *
 * Alternatywnie rozważano `user.deletedAt` (soft delete konta). Odrzucone, ponieważ
 * jeden user może mieć membershipy w wielu organizacjach — skasowanie konta
 * zablokowałoby dostęp do pozostałych akademii bez związku z offboardingiem.
 * `membership.status` wybiórczo wyłącza tylko tę jedną rolę.
 */

export class TrainerNotFoundError extends Error {
  constructor() {
    super("Trainer not found");
    this.name = "TrainerNotFoundError";
  }
}

export class TrainerHasFutureSessionsError extends Error {
  readonly sessions: { id: string; startTime: Date; groupTypeName: string }[];
  constructor(sessions: { id: string; startTime: Date; groupTypeName: string }[]) {
    super(`Trainer has ${sessions.length} future session(s)`);
    this.name = "TrainerHasFutureSessionsError";
    this.sessions = sessions;
  }
}

export interface DeactivateTrainerInput {
  organizationId: string;
  trainerUserId: string;
  actor: AuditActor;
  now?: Date;
}

/**
 * Deactivate a trainer (offboarding). Throws `TrainerHasFutureSessionsError`
 * if future sessions exist (US-21.1/AC1). Otherwise sets membership status
 * to 'suspended' — the trainer can no longer access the academy panel.
 */
export async function deactivateTrainer(
  tx: TenantDb,
  input: DeactivateTrainerInput,
): Promise<void> {
  const now = input.now ?? new Date();

  // 1. Verify the trainer exists and is active.
  const [existing] = await tx
    .select({ id: membershipTable.id, status: membershipTable.status })
    .from(membershipTable)
    .where(
      and(
        eq(membershipTable.organizationId, input.organizationId),
        eq(membershipTable.userId, input.trainerUserId),
        eq(membershipTable.role, "trainer"),
        eq(membershipTable.status, "active"),
      ),
    )
    .limit(1);
  if (!existing) throw new TrainerNotFoundError();

  // 2. Check for future sessions — hard block (US-21.1/AC1).
  const futureSessions = await listFutureSessionsForTrainer(
    tx,
    input.organizationId,
    input.trainerUserId,
    now,
  );
  if (futureSessions.length > 0) throw new TrainerHasFutureSessionsError(futureSessions);

  // 3. Suspend the membership.
  await tx
    .update(membershipTable)
    .set({ status: "suspended" })
    .where(and(eq(membershipTable.id, existing.id), eq(membershipTable.organizationId, input.organizationId)));

  // 4. Audit.
  await recordAudit(tx, {
    action: "trainer.deactivate",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "trainer",
    targetId: input.trainerUserId,
    targetLabel: input.trainerUserId,
  });
}
