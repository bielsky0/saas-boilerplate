import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Profile validation (etap 4, faza 4). Factory, not a constant (same rule as
 * `features/auth/schema.ts`): messages are translated, so the schema takes
 * the translator. Rules mirror the server backstop in `auth.service.ts`
 * (`updateProfileSchema` — trimmed, 1–120).
 */

type ProfileTranslator = NamespaceTranslator<"profile.validation">;

export function profileNameSchema(t: ProfileTranslator) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(120, t("nameTooLong")),
  });
}

export type ProfileNameInput = z.infer<ReturnType<typeof profileNameSchema>>;
