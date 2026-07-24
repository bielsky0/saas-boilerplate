/**
 * Notification types and their suppressibility (spec 23.1 / 23.3).
 *
 * Lives in the feature, not the job contract: which events exist and who may
 * mute them is product policy, exactly like `features/emails/categories.ts` is
 * for email. The job payload carries `type: string`; this module is what narrows
 * it and decides whether a preference row can silence it.
 *
 * SUPPRESSIBLE BY CONSTRUCTION: `NOTIFICATION_META[type].suppressible` is the
 * single source of truth, and `isInAppSuppressed` refuses to even consult the
 * preference table for a non-suppressible type. Today every wired type is
 * suppressible (none is a §23.3 security event yet), which is what makes the
 * "disabling a preference stops it" criterion demonstrable. When a "new login"
 * security notice lands, marking it `suppressible: false` here makes it
 * un-mutable without touching the handler or the preference UI.
 */

export type NotificationType =
  "verify-email" | "invitation" | "payment-failed" | "subscription-confirmed"
  // F9 / EPIK 29 — Plan limits (email-only, not suppressible in-app per spec)
  | "plan_limit_approaching" | "plan_limit_reached";

/**
 * Exhaustive by construction: `Record<NotificationType, _>` makes adding a type
 * without classifying it a COMPILE ERROR rather than a review comment.
 */
export const NOTIFICATION_META: Record<NotificationType, { suppressible: boolean }> = {
  "verify-email": { suppressible: true },
  invitation: { suppressible: true },
  "payment-failed": { suppressible: true },
  "subscription-confirmed": { suppressible: true },
  // F9: email-only, not suppressible in-app (spec says email-only)
  "plan_limit_approaching": { suppressible: false },
  "plan_limit_reached": { suppressible: false },
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_META) as NotificationType[];

export function isNotificationType(value: string): value is NotificationType {
  return value in NOTIFICATION_META;
}

export function isSuppressibleType(type: NotificationType): boolean {
  return NOTIFICATION_META[type].suppressible;
}
