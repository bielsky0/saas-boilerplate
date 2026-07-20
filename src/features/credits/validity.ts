import { zonedWallClockToUtc } from "@/lib/datetime";

/**
 * Credit validity windows (langlion §1.2, US-1.2/AC3).
 *
 * The spec's rule is one sentence — a credit is valid to "the end of the calendar
 * month in `organization.timezone`" — and every hard part of it is in the last
 * three words. "End of month" is a wall-clock statement about a particular
 * academy's calendar, while `credit.validUntil` is a UTC instant, so somebody has
 * to do the conversion. This module is that somebody, and it is the ONLY one:
 * doing it here, once, at issue time, is what lets the expiry sweep compare a
 * plain `validUntil <= now()` across every tenant at once (see `expire.ts`).
 *
 * Pure and dependency-light on purpose, like `schedule/recurrence.ts` which it
 * borrows the DST-correct conversion from — `validity.test.ts` runs under Vitest
 * with no database and no configured environment.
 */

/**
 * The instant a credit issued at `issuedAt` stops being spendable, for an academy
 * in `timeZone`.
 *
 * AN EXCLUSIVE UPPER BOUND: the first instant of the next month, local time.
 * Every reader therefore asks `validUntil > now()` for "still valid" and
 * `validUntil <= now()` for "expired", and the two are exact complements.
 *
 * The obvious alternative — the last instant of the month — has no correct
 * spelling. `23:59:59` leaks the final second, `23:59:59.999` leaks the final
 * millisecond, and both encode the storage precision into a business rule. A
 * half-open interval has neither problem and is the same convention the schedule
 * already uses for session ranges (`'[)'` in the §5.1 exclusion constraint), so
 * the codebase has one boundary convention rather than two.
 *
 * DST is handled by the conversion, not here: midnight on the first of the month
 * is an ordinary wall-clock time, resolved through the same two-pass probe that
 * keeps 17:00 classes at 17:00 across the March and October switches.
 */
export function endOfMonthValidity(issuedAt: Date, timeZone: string): Date {
  const { year, month } = localYearMonth(issuedAt, timeZone);
  // December rolls to January of the next year; `zonedWallClockToUtc` takes a
  // 1-based month, so 13 would be wrong rather than merely unusual.
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return zonedWallClockToUtc(nextYear, nextMonth, 1, 0, 0, timeZone);
}

/**
 * The calendar year and month `instant` falls in, as read in `timeZone`.
 *
 * Exported because "which month is a credit issued in" is a question the wallet
 * UI (F13) and the reporting paths will ask again, and asking it with the
 * server's zone is the bug this module exists to prevent. A credit bought at
 * 23:30 on the 31st in Warsaw belongs to that month, not to the next one a
 * UTC-based reading would report.
 */
export function localYearMonth(instant: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return { year: read("year"), month: read("month") };
}
