/**
 * Content date formatting (spec 8.1; §16 will make the locale a user choice).
 *
 * The locale is pinned to en-US rather than left to the runtime default. That is
 * not laziness: an unpinned `toLocaleDateString` formats using the SERVER's
 * locale, so the same page can render "July 1, 2026" in one deployment and
 * "01/07/2026" in another, and — worse — differ between server and client and
 * trip a hydration mismatch. Pinned, it is wrong for nobody and stable for
 * everybody until §16 introduces real locale negotiation, at which point this is
 * the one function to change.
 *
 * Input is a "YYYY-MM-DD" date with no timezone. Parsing that through `new Date`
 * would read it as UTC midnight and then render it in the local zone, which
 * moves the date backwards a day for anyone west of Greenwich — a post published
 * on the 1st showing as the 30th. Splitting the parts sidesteps the whole
 * timezone question, because a publication date does not have one.
 */
export function formatContentDate(isoDate: string): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
