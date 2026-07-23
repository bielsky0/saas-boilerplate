import { and, eq, gte, isNull } from "drizzle-orm";

import { classSession, groupType, membership, user } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Trainer data access (langlion §2.11, Faza 8).
 *
 * Trainers are members with `role = 'trainer'` and `status = 'active'`. There is
 * no separate `trainer` table — the user IS the trainer via their membership.
 *
 * ZAŁOŻENIE: user ma dokładnie jedną rolę w organizacji. Patrz komentarz w
 * `deactivate.ts` — jeśli w przyszłości dopuszczone zostanie multi-role, trzeba
 * przeprojektować offboarding na osobny `trainer_profile` zamiast manipulacji
 * membership.
 */

export interface TrainerRow {
  userId: string;
  email: string;
  name: string | null;
  membershipId: string;
  createdAt: Date;
}

export interface FutureSessionRow {
  id: string;
  startTime: Date;
  groupTypeName: string;
}

/** Active trainers for an academy, ordered by name. */
export async function listTrainers(tx: TenantDb, organizationId: string): Promise<TrainerRow[]> {
  return tx
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      membershipId: membership.id,
      createdAt: membership.createdAt,
    })
    .from(membership)
    .innerJoin(user, eq(membership.userId, user.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        eq(membership.role, "trainer"),
        eq(membership.status, "active"),
        isNull(user.deletedAt),
      ),
    )
    .orderBy(user.name);
}

/** One active trainer by userId, or null. */
export async function getTrainer(
  tx: TenantDb,
  organizationId: string,
  userId: string,
): Promise<TrainerRow | null> {
  const [row] = await tx
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      membershipId: membership.id,
      createdAt: membership.createdAt,
    })
    .from(membership)
    .innerJoin(user, eq(membership.userId, user.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        eq(membership.userId, userId),
        eq(membership.role, "trainer"),
        eq(membership.status, "active"),
        isNull(user.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Future, non-cancelled sessions assigned to a trainer. Used for offboarding
 * gating (US-21.1 — hard block if any exist). */
export async function listFutureSessionsForTrainer(
  tx: TenantDb,
  organizationId: string,
  trainerId: string,
  now: Date = new Date(),
): Promise<FutureSessionRow[]> {
  return tx
    .select({
      id: classSession.id,
      startTime: classSession.startTime,
      groupTypeName: groupType.name,
    })
    .from(classSession)
    .innerJoin(
      groupType,
      and(
        eq(groupType.id, classSession.groupTypeId),
        eq(groupType.organizationId, classSession.organizationId),
      ),
    )
    .where(
      and(
        eq(classSession.organizationId, organizationId),
        eq(classSession.trainerId, trainerId),
        eq(classSession.status, "scheduled"),
        gte(classSession.startTime, now),
      ),
    )
    .orderBy(classSession.startTime);
}
