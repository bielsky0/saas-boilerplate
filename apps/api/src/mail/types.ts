/**
 * Mail vocabulary (etap 5, faza 5.4). Kept in the API rather than `@repo/db`:
 * the schema only needs the folder CHECK string, while the service validates
 * against these tuples. Mirrors the AdminCN mail config (six folders, five
 * labels) without importing the frontend.
 */

export const MAIL_FOLDERS = ["inbox", "sent", "drafts", "spam", "trash", "archive"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export const MAIL_LABELS = ["social", "updates", "forums", "shopping", "promotions"] as const;
export type MailLabel = (typeof MAIL_LABELS)[number];

export function isMailFolder(value: unknown): value is MailFolder {
  return typeof value === "string" && (MAIL_FOLDERS as readonly string[]).includes(value);
}

export function isMailLabel(value: unknown): value is MailLabel {
  return typeof value === "string" && (MAIL_LABELS as readonly string[]).includes(value);
}
