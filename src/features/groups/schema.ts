import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";
import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/lib/validation";

/**
 * Group type and recurrence validation (langlion §1.2, §2.13, EPIK 2/23).
 *
 * This module is where the domain's closed vocabularies live as runtime values.
 * The schema columns declare them only as TypeScript unions on a `text` column
 * (repo convention: no `pgEnum`), which vanishes at runtime — so these `z.enum`s
 * are the single place a wire value is actually checked.
 */

type ValidationTranslator = NamespaceTranslator<"groups.validation">;

/**
 * NOT factories: this is wire vocabulary, not prose. The values travel into the
 * database and must not change with the reader's language (same split as
 * `invitableRole` in the organizations feature).
 */
export const engine = z.enum(["schedule_first", "availability_first", "slot_first"]);
export const paymentPolicy = z.enum(["online", "on_site", "both"]);
export const purchaseMode = z.enum(["single_class", "package"]);
export const billingType = z.enum(["one_time", "recurring"]);

/**
 * Two cross-field rules the column types cannot express (US-23.1/AC1, US-23.2/AC1):
 * at least one purchase mode, and `allowedBillingTypes` required exactly when
 * `package` is on offer. Both are refinements rather than column constraints
 * because they are product policy, and product policy is the thing most likely
 * to change without a migration.
 */
export function createGroupTypeSchema(t: ValidationTranslator) {
  return z
    .object({
      name: z.string().trim().min(2, t("nameMin")).max(160),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(SLUG_MIN, t("slugMin"))
        .max(SLUG_MAX, t("slugMax"))
        .regex(SLUG_PATTERN, t("slugFormat")),
      engine,
      paymentPolicy,
      /** Minor units of `organization.currency` — grosze, not złote (§2.14). */
      price: z.coerce.number().int().nonnegative(t("priceInvalid")),
      isNewClientOnly: z.boolean().default(false),
      defaultLocationId: z.string().min(1).optional(),
      allowedPurchaseModes: z.array(purchaseMode).min(1, t("purchaseModesRequired")),
      allowedBillingTypes: z.array(billingType).optional(),
    })
    .refine(
      (v) =>
        !v.allowedPurchaseModes.includes("package") || (v.allowedBillingTypes?.length ?? 0) > 0,
      { message: t("billingTypesRequired"), path: ["allowedBillingTypes"] },
    );
}

/**
 * `startTime` is LOCAL wall clock in `organization.timezone`, not an instant —
 * see the header of `schema/group-type-recurrences.ts`. `occurrencesCount` is
 * required exactly when the pattern recurs, which is what decides whether the
 * season-generation job has anything to do.
 */
export function createRecurrenceSchema(t: ValidationTranslator) {
  return z
    .object({
      groupTypeId: z.string().min(1),
      dayOfWeek: z.coerce.number().int().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, t("startTimeFormat")),
      durationMinutes: z.coerce.number().int().positive(t("durationInvalid")),
      trainerId: z.string().min(1).optional(),
      capacity: z.coerce.number().int().positive(t("capacityInvalid")),
      locationId: z.string().min(1).optional(),
      isRecurring: z.boolean().default(false),
      occurrencesCount: z.coerce.number().int().positive().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("startDateFormat")),
    })
    .refine((v) => !v.isRecurring || v.occurrencesCount !== undefined, {
      message: t("occurrencesRequired"),
      path: ["occurrencesCount"],
    });
}

export type CreateGroupTypeValues = z.infer<ReturnType<typeof createGroupTypeSchema>>;
export type CreateRecurrenceValues = z.infer<ReturnType<typeof createRecurrenceSchema>>;
