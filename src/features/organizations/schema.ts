import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";
import { SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/lib/validation";

/**
 * Shared org validation schemas (spec 3.2–3.4, 16.1).
 *
 * FACTORIES for the same reason `features/auth/schema.ts` is: a validation message
 * is a fact about the request, not about the rule. Pass the translator in:
 *
 *     const parsed = createOrgSchema(await getTranslations("organizations.validation"))
 *       .safeParse(input);
 *
 * The rules themselves stay in exactly one place, which is the property worth
 * protecting — they cannot be bypassed by posting directly.
 */

type ValidationTranslator = NamespaceTranslator<"organizations.validation">;

/**
 * Slug rule: lowercase letters, digits, single hyphens; 2–48 chars.
 *
 * The rule itself lives in `@/lib/validation` and is shared with `slugParam`,
 * the untranslated version the API routes and server actions hold a wire slug
 * to. This function only dresses it in messages. Keeping the pattern and the
 * bounds in one constant is what stops the form's rule and the API's rule from
 * drifting — before, the regex was written out here and nowhere else, so the
 * API simply had no rule at all.
 */
export function slugSchema(t: ValidationTranslator) {
  return z
    .string()
    .trim()
    .min(SLUG_MIN, t("slugMin"))
    .max(SLUG_MAX, t("slugMax"))
    .regex(SLUG_PATTERN, t("slugFormat"));
}

export function createOrgSchema(t: ValidationTranslator) {
  return z.object({
    name: z.string().trim().min(2, t("nameMin")).max(120),
    // Optional: if omitted the server derives it from the name.
    slug: slugSchema(t).optional(),
  });
}

/**
 * Invitable roles — Owner is never granted via invite (ownership is transferred).
 *
 * NOT factories: these are the wire vocabulary, not prose. The values travel to
 * the database and into `membership.role`, so they must never change with the
 * reader's language. Their DISPLAY names are `organizations.roles.*`, resolved at
 * render — see member-actions.tsx.
 */
export const invitableRole = z.enum(["admin", "member"]);
/** Assignable roles when updating an existing member (Owner promotion allowed). */
export const assignableRole = z.enum(["owner", "admin", "member"]);

export function inviteMemberSchema(t: ValidationTranslator) {
  return z.object({
    email: z.email(t("emailInvalid")).trim().toLowerCase(),
    role: invitableRole.default("member"),
  });
}

export function updateRoleSchema() {
  return z.object({
    membershipId: z.string().min(1),
    role: assignableRole,
  });
}

export type CreateOrgValues = z.infer<ReturnType<typeof createOrgSchema>>;
export type InviteMemberValues = z.infer<ReturnType<typeof inviteMemberSchema>>;
