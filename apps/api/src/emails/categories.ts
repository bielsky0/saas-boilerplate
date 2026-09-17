import type { TemplateName } from "@repo/contracts";

/**
 * Email categories and the template → category map (spec 10.3) — the Nest
 * twin of web's `features/emails/categories.ts`.
 *
 * Product policy, not provider capability: "transactional" is UNSUPPRESSIBLE
 * by construction (`SuppressibleCategory` excludes it), so the question of
 * muting a password reset is unrepresentable rather than merely never asked.
 */

export type EmailCategory = "transactional" | "onboarding" | "product";

/**
 * What an opt-out row may target. `"all"` is the sentinel a one-click
 * unsubscribe writes (RFC 8058 gives no category to scope by).
 */
export type SuppressibleCategory = Exclude<EmailCategory, "transactional"> | "all";

export const SUPPRESSIBLE_CATEGORIES: readonly SuppressibleCategory[] = [
  "onboarding",
  "product",
  "all",
] as const;

export function isSuppressibleCategory(value: string): value is SuppressibleCategory {
  return (SUPPRESSIBLE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Exhaustive by construction: `Record<TemplateName, _>` makes adding a
 * template without classifying it a COMPILE ERROR.
 */
export const TEMPLATE_CATEGORY: Record<TemplateName, EmailCategory> = {
  "verify-email": "transactional",
  "password-reset": "transactional",
  invitation: "transactional",
  "payment-failed": "transactional",
  "subscription-confirmed": "transactional",
  welcome: "onboarding",
  "onboarding-tips": "onboarding",
  "onboarding-features": "onboarding",
};

export function categoryFor(template: TemplateName): EmailCategory {
  return TEMPLATE_CATEGORY[template];
}
