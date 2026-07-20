import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";
import {
  RESERVED_SUBDOMAINS,
  SLUG_MAX,
  SLUG_MIN,
  SLUG_PATTERN,
  SUBDOMAIN_MAX,
  SUBDOMAIN_MIN,
  SUBDOMAIN_PATTERN,
} from "@/lib/validation";

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

/**
 * Subdomain rule (langlion §1.2, decyzja D10) — the academy's public address.
 *
 * Like `slugSchema`, the rule lives in `@/lib/validation` and this only dresses
 * it in messages. Two checks beyond the pattern: reserved labels, and a rejection
 * of anything that survived `.toLowerCase()` unchanged but is still not a legal
 * DNS label.
 *
 * Uniqueness is NOT checked here. It needs a database round-trip, so it belongs
 * to the action — see `createOrgAction`, which surfaces a taken subdomain as a
 * field error rather than letting the UNIQUE constraint surface as a 500.
 */
export function subdomainSchema(t: ValidationTranslator) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(SUBDOMAIN_MIN, t("subdomainMin"))
    .max(SUBDOMAIN_MAX, t("subdomainMax"))
    .regex(SUBDOMAIN_PATTERN, t("subdomainFormat"))
    .refine((value) => !RESERVED_SUBDOMAINS.includes(value), t("subdomainReserved"));
}

/**
 * Timezone and currency are validated against ICU's own tables rather than a
 * hand-maintained list: Node ships full ICU, so `Intl.supportedValuesOf` is the
 * authoritative set and it tracks tzdata updates for free. A typo'd zone would
 * otherwise only surface much later, as sessions generated an hour off.
 */
export function timezoneSchema(t: ValidationTranslator) {
  return z
    .string()
    .trim()
    .refine((value) => Intl.supportedValuesOf("timeZone").includes(value), t("timezoneInvalid"));
}

export function currencySchema(t: ValidationTranslator) {
  return z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => Intl.supportedValuesOf("currency").includes(value), t("currencyInvalid"));
}

/**
 * Creating an organization = creating an academy (langlion §1.2).
 *
 * `subdomain`, `timezone` and `currency` are REQUIRED with no default, mirroring
 * the columns (Constraint 5, US-24.1/AC1). The form supplies a sensible
 * suggestion for the timezone, but a suggestion the operator can see and change
 * is a different thing from a default they never notice.
 */
export function createOrgSchema(t: ValidationTranslator) {
  return z.object({
    name: z.string().trim().min(2, t("nameMin")).max(120),
    // Optional: if omitted the server derives it from the name.
    slug: slugSchema(t).optional(),
    subdomain: subdomainSchema(t),
    timezone: timezoneSchema(t),
    currency: currencySchema(t),
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
export const invitableRole = z.enum(["admin", "secretariat", "reception", "trainer", "member"]);
/** Assignable roles when updating an existing member (Owner promotion allowed). */
export const assignableRole = z.enum([
  "owner",
  "admin",
  "secretariat",
  "reception",
  "trainer",
  "member",
]);

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

/** Rows per page in the org audit trail (§6.4). */
export const AUDIT_PAGE_SIZE = 25;

/**
 * The org audit trail's searchParams (§6.4).
 *
 * NOT a factory, unlike the form schemas above: nothing here produces a message a
 * human reads. Every field `.catch()`es to a safe default, so a hand-edited or
 * shared URL (`?page=banana`, `?from=notadate`) degrades to the default view
 * rather than 500ing — the same discipline `admin/schema.ts` defends, and it
 * matters more here because a compliance view is a URL people paste to each other.
 *
 * The tenant is deliberately absent. It comes from the route slug via
 * `requireOrgPermission`, never from a query parameter — a filter the user can
 * type must never be able to name the tenant.
 */
export const orgAuditListQuerySchema = z.object({
  /** Matches actor email, target label, or action. */
  q: z.string().trim().max(200).catch(""),
  from: z.string().trim().catch(""),
  to: z.string().trim().catch(""),
  // Clamped: a huge offset is a cheap way to make Postgres sort the whole table.
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export type OrgAuditListQuery = z.infer<typeof orgAuditListQuerySchema>;
