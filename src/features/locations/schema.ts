import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Location validation (langlion §1.2, §2.12).
 *
 * Factories taking a translator, matching `features/organizations/schema.ts`: a
 * validation message is a fact about the request, not about the rule.
 */

type ValidationTranslator = NamespaceTranslator<"locations.validation">;

export function createLocationSchema(t: ValidationTranslator) {
  return z.object({
    name: z.string().trim().min(2, t("nameMin")).max(160),
    address: z.string().trim().max(400).optional(),
  });
}

export type CreateLocationValues = z.infer<ReturnType<typeof createLocationSchema>>;
