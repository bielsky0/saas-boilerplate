/**
 * Wall-clock ↔ instant conversion in an academy's time zone (US-1.2).
 *
 * Every langlion feature that touches dates needs BOTH directions of the same
 * rule, and they were about to be written twice:
 *   - forward  (wall clock → instant): session generation (§2.2), per-session
 *     edits (§3.4), and the month boundaries a public calendar queries (F5).
 *   - backward (instant → wall clock): grouping sessions into local days and
 *     rendering "18:00" to a parent (F5), where the same session must land on
 *     the same calendar day for every visitor regardless of their own zone.
 *
 * They live together because they are one rule seen from two sides, and because
 * the failure mode of a second copy is silent: an off-by-one-hour session that
 * looks deliberate. `recurrence.ts` used to own the forward half alone; F5
 * needed the inverse, so both moved here rather than the inverse being invented
 * next to the caller that first wanted it.
 *
 * This module has NO imports, deliberately — not even `@/lib/env/server`, which
 * validates the entire server env at import time and would make these functions
 * untestable outside a configured environment. Everything is pure, so
 * `datetime.test.ts` runs under Vitest without a database or a build.
 */

/** A local calendar date, kept apart from `Date` so wall-clock math never touches an instant. */
export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * The UTC offset (in ms) that `timeZone` was observing at `instant`.
 *
 * Formats the instant into that zone's wall-clock parts, reads them back as if
 * they were UTC, and takes the difference. Node ships full ICU, so every IANA
 * zone resolves without a date library.
 */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );

  return asUtc - instant;
}

/**
 * Resolve a local wall-clock time in `timeZone` to the UTC instant it names.
 *
 * Two passes, and the second one is load-bearing. The first pass has to guess an
 * offset by probing a point in time that is itself wrong (the wall-clock reading
 * interpreted as UTC), which lands on the wrong side of a DST transition for
 * times within an offset's distance of the boundary. Re-probing at the corrected
 * instant fixes it. A single pass silently produces off-by-one-hour sessions for
 * the days around the March and October switches — the exact bug US-1.2/AC1
 * exists to prevent.
 *
 * Behaviour at the two pathological wall-clock times, both pinned by tests
 * rather than left to chance: a nonexistent time (the hour skipped in spring)
 * resolves forward past the gap, and an ambiguous one (the hour repeated in
 * autumn) resolves to the *second*, post-transition occurrence. The latter falls
 * out of the two-pass probe rather than being chosen — most date libraries pick
 * the first instead. It is left as-is because the case cannot arise in this
 * domain (it needs a class starting inside the 02:00-03:00 local window on one
 * night a year) and because being deterministic and documented matters more here
 * than matching a convention. If a caller ever does need the earlier instant,
 * that is a deliberate change with a test to update, not a silent surprise.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = naive - offsetAt(naive, timeZone);
  return new Date(naive - offsetAt(firstPass, timeZone));
}

/**
 * The inverse: the wall-clock parts `instant` reads as in `timeZone`.
 *
 * The half F5 needed and `recurrence.ts` never had. Formats through `Intl` for
 * the same reason `offsetAt` does — the zone database, including historical and
 * future DST rules, is the runtime's job and not ours.
 */
export function zonedPartsOf(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/** Zero-pad to two digits, so `zonedDayKey` and `zonedWallClock` agree on shape. */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The `YYYY-MM-DD` calendar day `instant` falls on IN `timeZone`.
 *
 * THE ONLY correct way to group sessions into days for the enrollment calendar,
 * and the trap it exists to close is `instant.toISOString().slice(0, 10)`. That
 * reads the day in UTC, so an 18:00 Warsaw class in summer is still 16:00Z and
 * groups correctly by luck, while a 01:00 Warsaw class lands on the PREVIOUS
 * day — as does every evening class for an academy east of UTC. The bug is
 * invisible in a `Europe/Warsaw` afternoon and obvious in `Pacific/Auckland`.
 */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedPartsOf(instant, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The `HH:MM` local reading of `instant` in `timeZone`, for rendering a slot. */
export function zonedWallClock(instant: Date, timeZone: string): string {
  const { hour, minute } = zonedPartsOf(instant, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * Resolve a `datetime-local` value (`YYYY-MM-DDTHH:mm`) to the instant it names
 * in `timeZone`.
 *
 * Returns the raw string unchanged when it does not match, letting the caller's
 * zod schema produce the field error instead of this function inventing one.
 * That signature (`Date | string`) is deliberate: a `datetime-local` input is
 * free text as far as the server is concerned.
 */
export function wallClockToInstant(value: string, timeZone: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  return zonedWallClockToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    timeZone,
  );
}

/**
 * The half-open instant range `[from, to)` covering the calendar month `YYYY-MM`
 * in `timeZone`.
 *
 * A month boundary is a wall-clock fact, not a UTC one: October in Warsaw starts
 * at 22:00Z on 30 September and ends at 23:00Z on 31 October, because the DST
 * switch falls inside it. Computing either end with `Date.UTC` directly puts an
 * hour of sessions in the wrong month, twice a year, in the two months a parent
 * is most likely to be browsing a new season.
 */
export function monthRangeInZone(month: string, timeZone: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match?.[1] || !match[2]) {
    throw new Error(`month must be YYYY-MM, received: ${month}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);

  const nextYear = monthIndex === 12 ? year + 1 : year;
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;

  return {
    from: zonedWallClockToUtc(year, monthIndex, 1, 0, 0, timeZone),
    to: zonedWallClockToUtc(nextYear, nextMonth, 1, 0, 0, timeZone),
  };
}

/** Shift a `YYYY-MM` month string by whole months, for the calendar's prev/next links. */
export function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match?.[1] || !match[2]) {
    throw new Error(`month must be YYYY-MM, received: ${month}`);
  }
  // Date.UTC as a CALENDAR only — never read back as an instant, so no zone is
  // involved and DST cannot perturb the arithmetic.
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}
