/**
 * Notification types and their suppressibility (spec 23.1 / 23.3) — the Nest
 * twin of web's `features/notifications/types.ts`.
 *
 * Product policy: which events exist and who may mute them. The job payload
 * carries `type: string`; this module narrows it and decides whether a
 * preference row can silence it. SUPPRESSIBLE BY CONSTRUCTION: a
 * non-suppressible type never consults the preference table.
 *
 * Exhaustive by construction: `Record<NotificationType, _>` makes adding a
 * type without classifying it a COMPILE ERROR.
 */

export type NotificationType =
  "verify-email" | "invitation" | "payment-failed" | "subscription-confirmed";

export const NOTIFICATION_META: Record<NotificationType, { suppressible: boolean }> = {
  "verify-email": { suppressible: true },
  invitation: { suppressible: true },
  "payment-failed": { suppressible: true },
  "subscription-confirmed": { suppressible: true },
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_META) as NotificationType[];

export function isNotificationType(value: string): value is NotificationType {
  return value in NOTIFICATION_META;
}

export function isSuppressibleType(type: NotificationType): boolean {
  return NOTIFICATION_META[type].suppressible;
}
