import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * E-dziennik validation (langlion §2.33, EPIK 35, v16, Faza 6).
 */

type ValidationTranslator = NamespaceTranslator<"grades.validation">;

/** Resolved with the user before this phase (spec §8 #11): all three types, both scopes. */
export const gradeFieldType = z.enum(["numeric", "scale", "text"]);

/**
 * A `grade_field` is scoped to a `group_type` OR a `session`, never both — the
 * XOR the CHECK constraint (`grade_field_owner_ck`) enforces at the database.
 * `scope` picks which id the form actually submits; the other stays empty.
 */
export function createGradeFieldSchema(t: ValidationTranslator) {
  return z
    .object({
      name: z.string().trim().min(1, t("nameRequired")).max(120),
      fieldType: gradeFieldType,
      scope: z.enum(["group_type", "session"]),
      groupTypeId: z.string().optional(),
      sessionId: z.string().optional(),
      minValue: z.coerce.number().int().optional(),
      maxValue: z.coerce.number().int().optional(),
    })
    .refine((v) => (v.scope === "group_type" ? !!v.groupTypeId : !!v.sessionId), {
      message: t("scopeTargetRequired"),
      path: ["scope"],
    })
    .refine((v) => v.minValue === undefined || v.maxValue === undefined || v.minValue <= v.maxValue, {
      message: t("minMaxOrder"),
      path: ["maxValue"],
    });
}

export function enterGradeSchema(t: ValidationTranslator) {
  return z.object({
    gradeFieldId: z.string().min(1),
    bookingId: z.string().min(1),
    value: z.string().trim().min(1, t("valueRequired")).max(500),
  });
}

export function addProgressNoteSchema(t: ValidationTranslator) {
  return z.object({
    bookingId: z.string().min(1),
    content: z.string().trim().min(1, t("contentRequired")).max(2000),
  });
}

export type CreateGradeFieldValues = z.infer<ReturnType<typeof createGradeFieldSchema>>;
export type EnterGradeValues = z.infer<ReturnType<typeof enterGradeSchema>>;
export type AddProgressNoteValues = z.infer<ReturnType<typeof addProgressNoteSchema>>;
