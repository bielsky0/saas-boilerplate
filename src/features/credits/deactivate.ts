import { and, eq, isNull } from "drizzle-orm";

import type { AuditActor } from "@/features/admin/audit";
import { recordAudit } from "@/features/admin/audit";
import { creditType } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Credit type deactivation (langlion §2.11, EPIK 20/AC3).
 *
 * Deactivating a credit type prevents NEW purchases — existing credits continue
 * to work until their natural expiry (US-20.1/AC3). No hard block, because
 * existing credits are independent rows with their own `validUntil`.
 *
 * GATING: uses `group_types.deactivate` permission because credit_type has a
 * structural 1:1 relationship with group_type (enforced by
 * `credit_type_group_type_uq` unique constraint on `groupTypeId`). A standalone
 * credit type deactivation should remain a deliberate decision reviewed on its
 * own merits — do not add a dedicated permission without re-reviewing this
 * coupling.
 */

export class CreditTypeNotFoundError extends Error {
  constructor() {
    super("Credit type not found");
    this.name = "CreditTypeNotFoundError";
  }
}

export interface DeactivateCreditTypeInput {
  organizationId: string;
  creditTypeId: string;
  actor: AuditActor;
  now?: Date;
}

export async function deactivateCreditType(
  tx: TenantDb,
  input: DeactivateCreditTypeInput,
): Promise<void> {
  const now = input.now ?? new Date();

  // 1. Verify the credit type exists and is active.
  const [existing] = await tx
    .select({ id: creditType.id, name: creditType.name })
    .from(creditType)
    .where(
      and(
        eq(creditType.id, input.creditTypeId),
        eq(creditType.organizationId, input.organizationId),
        isNull(creditType.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new CreditTypeNotFoundError();

  // 2. Soft delete — existing credits keep working (US-20.1/AC3).
  await tx
    .update(creditType)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(creditType.id, input.creditTypeId),
        eq(creditType.organizationId, input.organizationId),
      ),
    );

  // 3. Audit.
  await recordAudit(tx, {
    action: "credit_type.deactivate",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "credit_type",
    targetId: input.creditTypeId,
    targetLabel: existing.name,
  });
}
