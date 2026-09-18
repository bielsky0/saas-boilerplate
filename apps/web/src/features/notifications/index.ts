/**
 * Notifications feature module (spec 23 — the in-app notification center).
 *
 * Faza 2.8: creation, delivery and preferences moved to Nest (`apps/api/src/
 * notifications` + the `notification.create` job — the second delivery channel
 * next to email, §10). What stays here is the BELL surface the web still owns:
 * the type vocabulary both sides share (`types`) and the global bell +
 * preferences form, which talk to Nest through the thin `/api/notifications/*`
 * proxies (`client.ts` beside them).
 */

export {
  NOTIFICATION_TYPES,
  NOTIFICATION_META,
  isNotificationType,
  isSuppressibleType,
  type NotificationType,
} from "./types";
export { NotificationBell } from "./components/notification-bell";
