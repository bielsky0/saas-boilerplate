import { and, eq, gte, isNull } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { groupType, groupTypeRecurrence, classSession } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Group type deactivation (langlion §2.11, US-21.6, EPIK 20/AC1).
 *
 * Hard-blocked when:
 *   1. Any recurrence still has `isRecurring=true` (US-21.6/AC1).
 *   2. Any future, non-cancelled session exists (US-21.6/AC2).
 * The admin must resolve all blockers first: stop recurring patterns, cancel or
 * let past sessions pass. Once blockers are cleared, deactivation sets `deletedAt`.
 *
 * Zasada #4 — block with dependency list, not a wizard.
 */

export type GroupTypeDeactivationBlock =
  | { kind: "has-active-recurrences" }
  | { kind: "has-future-sessions"; count: number };

export class GroupTypeDeactivationBlockedError extends Error {
  readonly blocks: GroupTypeDeactivationBlock[];
  constructor(blocks: GroupTypeDeactivationBlock[]) {
    const kinds = blocks.map((b) => b.kind).join(", ");
    super(`Group type deactivation blocked: ${kinds}`);
    this.name = "GroupTypeDeactivationBlockedError";
    this.blocks = blocks;
  }
}

export class GroupTypeNotFoundError extends Error {
  constructor() {
    super("Group type not found");
    this.name = "GroupTypeNotFoundError";
  }
}

/**
 * Check what blocks deactivation — pure check, no mutation.
 * Returns an empty array when deactivation would succeed.
 */
export async function checkGroupTypeDeactivation(
  tx: TenantDb,
  organizationId: string,
  groupTypeId: string,
  now: Date = new Date(),
): Promise<GroupTypeDeactivationBlock[]> {
  const blocks: GroupTypeDeactivationBlock[] = [];

  // 1. Check for active recurring patterns (US-21.6/AC1).
  const [recurring] = await tx
    .select({ id: groupTypeRecurrence.id })
    .from(groupTypeRecurrence)
    .where(
      and(
        eq(groupTypeRecurrence.organizationId, organizationId),
        eq(groupTypeRecurrence.groupTypeId, groupTypeId),
        eq(groupTypeRecurrence.isRecurring, true),
        isNull(groupTypeRecurrence.deletedAt),
      ),
    )
    .limit(1);
  if (recurring) blocks.push({ kind: "has-active-recurrences" });

  // 2. Check for future, non-cancelled sessions (US-21.6/AC2).
  const futureSessions = await tx
    .select({ id: classSession.id })
    .from(classSession)
    .where(
      and(
        eq(classSession.organizationId, organizationId),
        eq(classSession.groupTypeId, groupTypeId),
        eq(classSession.status, "scheduled"),
        gte(classSession.startTime, now),
      ),
    )
    .limit(1);
  if (futureSessions.length > 0) {
    blocks.push({ kind: "has-future-sessions", count: futureSessions.length });
  }

  return blocks;
}

export interface DeactivateGroupTypeInput {
  organizationId: string;
  groupTypeId: string;
  actor: AuditActor;
  now?: Date;
}

/**
 * Deactivate a group type. Throws `GroupTypeDeactivationBlockedError` if
 * blockers exist (US-21.6). Otherwise sets `deletedAt` — existing sessions
 * and bookings remain untouched (US-20.1/AC1).
 */
export async function deactivateGroupType(
  tx: TenantDb,
  input: DeactivateGroupTypeInput,
): Promise<void> {
  const now = input.now ?? new Date();

  // 1. Verify it exists and is active.
  const [existing] = await tx
    .select({ id: groupType.id, name: groupType.name })
    .from(groupType)
    .where(
      and(
        eq(groupType.id, input.groupTypeId),
        eq(groupType.organizationId, input.organizationId),
        isNull(groupType.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new GroupTypeNotFoundError();

  // 2. Check blockers.
  const blocks = await checkGroupTypeDeactivation(tx, input.organizationId, input.groupTypeId, now);
  if (blocks.length > 0) throw new GroupTypeDeactivationBlockedError(blocks);

  // 3. Soft delete.
  await tx
    .update(groupType)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(groupType.id, input.groupTypeId), eq(groupType.organizationId, input.organizationId)));

  // 4. Audit.
  await recordAudit(tx, {
    action: "group_type.deactivate",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "group_type",
    targetId: input.groupTypeId,
    targetLabel: existing.name,
  });
}
