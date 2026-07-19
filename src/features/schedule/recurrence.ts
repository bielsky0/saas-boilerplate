/**
 * Recurrence expansion for Schedule-First session generation (spec §2.2, US-1.2).
 *
 * An academy defines a weekly pattern in *local wall-clock* terms ("Mondays at
 * 17:00, 30 times"), but `session.startTime` is stored as a UTC instant. The
 * conversion between the two is the whole job of this module, and it is not
 * arithmetic on milliseconds: across a DST boundary the same wall-clock time
 * maps to a different UTC offset, so "17:00 local" is 16:00Z in winter and
 * 15:00Z in summer for `Europe/Warsaw`. Classes must not drift by an hour twice
 * a year (US-1.2/AC1).
 *
 * This module deliberately has NO imports — not even `@/lib/env/server`, which
 * validates the entire server env at import time and would make these functions
 * untestable outside a configured environment. Everything here is pure, so
 * `recurrence.test.ts` runs under Vitest without a database or a build.
 */

/** One generated occurrence, as UTC instants ready for `session.startTime/endTime`. */
export type Occurrence = { startsAt: Date; endsAt: Date };

export type RecurrenceInput = {
  /** Local calendar date the pattern starts from, `YYYY-MM-DD` in `timeZone`. */
  startDate: string;
  /** 0 = Sunday … 6 = Saturday, evaluated locally in `timeZone`. */
  dayOfWeek: number;
  /** Local wall-clock start, `HH:MM` in `timeZone`. */
  startTime: string;
  durationMinutes: number;
  occurrencesCount: number;
  /** IANA zone from `organization.timezone`. */
  timeZone: string;
};

/** A local calendar date, kept apart from `Date` so wall-clock math never touches an instant. */
type LocalDate = { year: number; month: number; day: number };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

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

/** Parse `YYYY-MM-DD` into a local calendar date. Throws on malformed input. */
function parseLocalDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`startDate must be YYYY-MM-DD, received: ${value}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Parse `HH:MM` into hours and minutes. Throws on malformed input. */
function parseWallClock(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error(`startTime must be HH:MM, received: ${value}`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * Advance a local calendar date by whole days.
 *
 * Uses `Date.UTC` purely as a calendar (leap years, month lengths) and never as
 * an instant, so no time zone is involved and DST cannot perturb it. This is why
 * the weekly step below is a calendar step, not `+7 * 24h` on a timestamp: the
 * week containing a DST switch is 167 or 169 real hours long, and stepping by a
 * fixed 168 hours would shift every subsequent session by an hour.
 */
function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Day of week (0 = Sunday) for a local calendar date, via the same calendar-only trick. */
function dayOfWeekOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * Expand a weekly pattern into `occurrencesCount` UTC instants (spec §2.2).
 *
 * The first occurrence is the earliest `dayOfWeek` on or after `startDate`, so a
 * pattern saved with a start date that is not itself that weekday still begins
 * on the right day rather than silently skipping a week.
 *
 * `endsAt` is `startsAt` plus the duration as elapsed time, not as wall-clock
 * time. A 60-minute class that straddles a DST boundary lasts 60 real minutes;
 * its local end time is what shifts, and that is correct — the trainer is in the
 * room for an hour either way.
 */
export function generateOccurrences(input: RecurrenceInput): Occurrence[] {
  const { dayOfWeek, durationMinutes, occurrencesCount, timeZone } = input;

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error(`dayOfWeek must be an integer 0-6, received: ${dayOfWeek}`);
  }
  if (occurrencesCount <= 0) return [];

  const { hour, minute } = parseWallClock(input.startTime);
  const start = parseLocalDate(input.startDate);

  // Distance forward to the first matching weekday; 0 when startDate already matches.
  let cursor = addDays(start, (dayOfWeek - dayOfWeekOf(start) + 7) % 7);

  const occurrences: Occurrence[] = [];
  for (let i = 0; i < occurrencesCount; i += 1) {
    const startsAt = zonedWallClockToUtc(
      cursor.year,
      cursor.month,
      cursor.day,
      hour,
      minute,
      timeZone,
    );
    occurrences.push({
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * MINUTE_MS),
    });
    cursor = addDays(cursor, 7);
  }

  return occurrences;
}
