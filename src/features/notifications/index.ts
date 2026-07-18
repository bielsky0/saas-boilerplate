/**
 * Notifications feature module (spec 23 — the in-app notification center).
 *
 * The SECOND delivery channel next to email (§10): a business event enqueues a
 * `notification.create` job independently of any `email.send`, so the two never
 * gate each other. Owns everything policy-shaped: which types exist and which may
 * be muted (`types`), the owner-scoped data layer (`data`), the one door feature
 * code raises a notification through (`send` → `enqueueNotification`), and the one
 * place a row is written (`handler`).
 *
 * Barrel exports only isomorphic pieces + the global bell (mirroring how
 * `organizations` exports `AccountSwitcher`). Server-only modules — `send`,
 * `handler`, `data`, `context`, `actions` — are imported from their own paths so
 * server code stays out of the client bundle.
 */

export {
  NOTIFICATION_TYPES,
  NOTIFICATION_META,
  isNotificationType,
  isSuppressibleType,
  type NotificationType,
} from "./types";
export { NotificationBell } from "./components/notification-bell";
