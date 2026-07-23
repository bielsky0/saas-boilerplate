import { recordAudit, type AuditActor } from "@/features/admin/audit";
import { gradeField } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Grade field definition (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * Scope is XOR by construction (`grade_field_owner_ck`) — the caller passes
 * exactly one of `groupTypeId`/`sessionId`, validated in
 * `features/grades/schema.ts` before this ever runs, and the CHECK constraint is
 * the second line that holds if that validation is ever bypassed.
 */
export interface CreateGradeFieldInput {
  organizationId: string;
  name: string;
  fieldType: "numeric" | "scale" | "text";
  groupTypeId?: string | null;
  sessionId?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  actor: AuditActor;
}

export async function createGradeField(
  tx: TenantDb,
  input: CreateGradeFieldInput,
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(gradeField)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      fieldType: input.fieldType,
      groupTypeId: input.groupTypeId ?? null,
      sessionId: input.sessionId ?? null,
      minValue: input.minValue ?? null,
      maxValue: input.maxValue ?? null,
    })
    .returning({ id: gradeField.id });
  if (!row) throw new Error("createGradeField: insert returned no row");

  await recordAudit(tx, {
    action: "grade_field.create",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "grade_field",
    targetId: row.id,
    targetLabel: input.name,
    metadata: {
      fieldType: input.fieldType,
      groupTypeId: input.groupTypeId ?? null,
      sessionId: input.sessionId ?? null,
    },
  });

  return { id: row.id };
}
