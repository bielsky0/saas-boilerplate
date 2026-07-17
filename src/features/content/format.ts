import { type Locale } from "@/lib/i18n/config";

/**
 * Content date formatting (spec 8.1, §16).
 *
 * The locale is an ARGUMENT, never the runtime default. That distinction is the
 * whole point of this function: an unpinned `toLocaleDateString` formats using
 * the SERVER's locale, so the same page renders "July 1, 2026" in one deployment
 * and "01/07/2026" in another, and — worse — differs between server and client
 * and trips a hydration mismatch. Passing it explicitly means the date matches
 * the page's language because the caller said so, not because a machine somewhere
 * happened to agree.
 *
 * (This used to be pinned to `en-US` with a note saying §16 would make it the one
 * function to change. This is that change.)
 *
 * Input is a "YYYY-MM-DD" date with no timezone. Parsing that through `new Date`
 * would read it as UTC midnight and then render it in the local zone, which
 * moves the date backwards a day for anyone west of Greenwich — a post published
 * on the 1st showing as the 30th. Splitting the parts sidesteps the whole
 * timezone question, because a publication date does not have one. Locale
 * awareness does not change that: it is still a date without a zone, now spelled
 * in the reader's language.
 */
export function formatContentDate(isoDate: string, locale: Locale): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
