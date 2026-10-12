import { format, formatDistanceToNow, type Locale } from "date-fns";

/**
 * Mail presentation helpers (etap 5, faza 5.4). Folder/label ordering comes from
 * AdminCN's `mailConfig`; the labels themselves are translated
 * (`mail.folders.*` / `mail.labels.*`). Dates are relative within the last week
 * and an absolute `MMM d` beyond — fully localized through the date-fns locale.
 */
export const MAIL_FOLDER_ORDER = ["inbox", "drafts", "sent", "spam", "trash", "archive"] as const;
export const MAIL_LABEL_ORDER = ["social", "updates", "forums", "shopping", "promotions"] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function formatMailDate(date: Date, locale: Locale): string {
  if (Date.now() - date.getTime() < WEEK_MS) {
    return formatDistanceToNow(date, { addSuffix: true, locale }).replace(/^about /, "");
  }
  return format(date, "MMM d", { locale });
}
