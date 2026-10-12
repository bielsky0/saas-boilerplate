/**
 * Mail presentation helpers (etap 5, faza 5.4).
 *
 * Folder/label ordering comes from AdminCN's `mailConfig`. Dates are formatted
 * with the platform `Intl` APIs — `date-fns` is reserved for the calendar
 * (stage rule), so mail carries no date library at all.
 */
export const MAIL_FOLDER_ORDER = ["inbox", "drafts", "sent", "spam", "trash", "archive"] as const;
export const MAIL_LABEL_ORDER = ["social", "updates", "forums", "shopping", "promotions"] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Relative within the last week, absolute `MMM d` beyond. `locale` is a BCP-47 tag. */
export function formatMailDate(date: Date, locale: string): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs >= 0 && diffMs < WEEK_MS) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const seconds = diffMs / 1000;
    if (seconds < 60) return relative.format(-Math.round(seconds), "second");
    const minutes = seconds / 60;
    if (minutes < 60) return relative.format(-Math.round(minutes), "minute");
    const hours = minutes / 60;
    if (hours < 24) return relative.format(-Math.round(hours), "hour");
    return relative.format(-Math.round(hours / 24), "day");
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}
