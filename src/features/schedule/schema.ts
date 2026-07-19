import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Session validation (langlion §1.2, §2.2, EPIK 3).
 *
 * The recurrence PATTERN is validated in `features/groups/schema.ts` — it belongs
 * to the Definition. What lives here is the Realisation: per-session edits an
 * admin makes to an already-generated row (§3.4/AC9, US-14.4, US-22.3).
 */

type ValidationTranslator = NamespaceTranslator<"schedule.validation">;

/** Wire vocabulary, not prose — see the note in `features/groups/schema.ts`. */
export const sessionStatus = z.enum(["scheduled", "cancelled"]);

/**
 * A manual per-session adjustment.
 *
 * Every field is optional because the three things an admin edits here are
 * independent: move it in time, move it to another room, or make space
 * (US-14.4 — the only legitimate way past a full session, since no role may
 * exceed capacity). Persisting any of the first two must also set
 * `isManuallyAdjusted`, so a later bulk update from the pattern skips this row
 * (§3.4/AC8) — that is the action's job, not this schema's.
 */
export function updateSessionSchema(t: ValidationTranslator) {
  return (
    z
      .object({
        startTime: z.coerce.date().optional(),
        endTime: z.coerce.date().optional(),
        locationId: z.string().min(1).nullish(),
        capacity: z.coerce.number().int().positive(t("capacityInvalid")).optional(),
      })
      .refine((v) => !(v.startTime && v.endTime) || v.endTime > v.startTime, {
        message: t("endBeforeStart"),
        path: ["endTime"],
      })
      // Moving one endpoint without the other would silently keep the old duration
      // against a new start, which is never what the admin meant.
      .refine((v) => Boolean(v.startTime) === Boolean(v.endTime), {
        message: t("bothTimesRequired"),
        path: ["endTime"],
      })
  );
}

export type UpdateSessionValues = z.infer<ReturnType<typeof updateSessionSchema>>;
