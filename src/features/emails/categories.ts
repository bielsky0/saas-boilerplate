import type { TemplateName } from "@/lib/adapters/email";

/**
 * Email categories and the template → category map (spec 10.3).
 *
 * Lives in the feature, not in the adapter's contract: a category is product
 * policy about who may opt out of what, not a capability of any provider. The
 * adapter stays dumb transport.
 *
 * "transactional" is UNSUPPRESSIBLE, and it is unsuppressible by CONSTRUCTION
 * rather than by a runtime check: `SuppressibleCategory` excludes it, so
 * `email_suppression.category` cannot hold it and `isSuppressed` cannot be asked
 * about it. You cannot opt out of a password reset — the user asked for it thirty
 * seconds ago, and an opt-out that silences it is a lockout, not a preference.
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
 * Exhaustive by construction: `Record<TemplateName, _>` makes adding a template
 * without classifying it a COMPILE ERROR rather than a code-review finding. The
 * type is the enforcement; this comment is only the explanation.
 *
 * `welcome` is onboarding, not transactional: spec 10.3 makes day-0 welcome step
 * one of the sequence, and every onboarding email must carry an unsubscribe link.
 */
export const TEMPLATE_CATEGORY: Record<TemplateName, EmailCategory> = {
  "verify-email": "transactional",
  "password-reset": "transactional",
  invitation: "transactional",
  "payment-failed": "transactional",
  "subscription-confirmed": "transactional",
  // Unsuppressible by construction, and this is the clearest case in the map: the
  // parent asked for it seconds ago, and an opt-out that silenced it would be a
  // lockout with no other way in — parents have no password to fall back on.
  "client-otp": "transactional",
  welcome: "onboarding",
  "onboarding-tips": "onboarding",
  "onboarding-features": "onboarding",
  // E-mail-first by decision (Rozstrzygnięcie #3, plan Faza 6): a parent cannot
  // opt out of being told their child received a grade/note, the same reasoning
  // as `client-otp` — there is no other channel to fall back to (F13 hasn't
  // built the client panel view yet).
  "grade-recorded": "transactional",
  "progress-note-added": "transactional",
};

export function categoryFor(template: TemplateName): EmailCategory {
  return TEMPLATE_CATEGORY[template];
}
