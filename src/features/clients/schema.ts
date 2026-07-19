import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Client and athlete validation (langlion §1.2 rewizja 14.1, EPIK 4).
 *
 * Note what is NOT here: a password rule. Parents never get a boilerplate `user`
 * row — they authenticate with a domain OTP scoped to `(organizationId, email)`,
 * so a code issued by one academy is useless at another (§2.19). That token
 * table and its schema arrive with F3.
 */

type ValidationTranslator = NamespaceTranslator<"clients.validation">;

/**
 * The public registration form (US-4.1).
 *
 * Only the email is required. An academy that does not collect phone numbers, or
 * a parent who has not given one, should not be blocked from booking — and `age`
 * is optional in the spec for the same reason. The name is optional here because
 * the row may be created by the upsert before the parent has finished typing.
 */
export function registerClientSchema(t: ValidationTranslator) {
  return z.object({
    email: z.email(t("emailInvalid")).trim().toLowerCase(),
    name: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
  });
}

export function createAthleteSchema(t: ValidationTranslator) {
  return z.object({
    name: z.string().trim().min(2, t("athleteNameMin")).max(160),
    // Bounded rather than merely positive: a four-digit age is a typo, and this
    // is a children's academy, not a nursing home.
    age: z.coerce.number().int().min(1).max(120).optional(),
  });
}

export type RegisterClientValues = z.infer<ReturnType<typeof registerClientSchema>>;
export type CreateAthleteValues = z.infer<ReturnType<typeof createAthleteSchema>>;
