import { zonedDayKey, zonedPartsOf, zonedWallClock } from "@/lib/datetime";

/**
 * Month-grid shaping for the public enrollment calendar (F5, EPIK 4, US-15.1).
 *
 * Pure: no database, no `@/lib/env/server`, so `calendar.test.ts` runs under
 * Vitest without a build. The queries live in `data.ts`; this module only decides
 * which local day each session belongs to and which cells the grid has.
 *
 * EVERYTHING HERE IS IN THE ACADEMY'S ZONE, never the visitor's and never UTC.
 * A parent in another country must see the class on the day it actually happens
 * locally (US-1.2/AC2), and `session.startTime` is a UTC instant, so the day a
 * session belongs to is a question that cannot be answered without the zone.
 * `zonedDayKey` is the only correct way to ask it — see the trap documented
 * there about `toISOString().slice(0, 10)`.
 */

/** A session as the calendar renders it: instants already reduced to local readings. */
export interface CalendarSlot {
  sessionId: string;
  /** Local `HH:MM` in the academy's zone. */
  startsAt: string;
  endsAt: string;
  capacity: number;
  activeCount: number;
  freeSeats: number;
  /** False when the session is at capacity — rendered, but not selectable (US-15.1/AC1). */
  bookable: boolean;
  locationName: string | null;
}

/** One cell of the month grid. `null` day = a leading/trailing blank. */
export interface CalendarDay {
  /** `YYYY-MM-DD` in the academy's zone, or null for a padding cell. */
  dayKey: string | null;
  /** Day of month, for the label. */
  dayOfMonth: number | null;
  slots: CalendarSlot[];
  /** True when the day has at least one session with a free seat. */
  hasBookableSlot: boolean;
}

export interface AvailabilityRow {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  capacity: number;
  activeCount: number;
  locationName: string | null;
}

/**
 * Reduce one availability row to its local reading.
 *
 * `freeSeats` is clamped at zero rather than allowed to go negative. A negative
 * value is reachable in principle — an admin may lower `session.capacity` below
 * the number of bookings already taken, which §5.2 permits because it refuses new
 * seats without evicting existing ones — and "-2 wolnych miejsc" is not a thing
 * to show a parent. `bookable` is false either way.
 */
function toSlot(row: AvailabilityRow, timeZone: string): CalendarSlot {
  const freeSeats = Math.max(0, row.capacity - row.activeCount);
  return {
    sessionId: row.sessionId,
    startsAt: zonedWallClock(row.startTime, timeZone),
    endsAt: zonedWallClock(row.endTime, timeZone),
    capacity: row.capacity,
    activeCount: row.activeCount,
    freeSeats,
    bookable: freeSeats > 0,
    locationName: row.locationName,
  };
}

/** Days in `month` (`YYYY-MM`), read as a calendar rather than as instants. */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of this one. Date.UTC as a calendar
  // only — never read back as an instant, so no zone is involved.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Build the month grid for `month` (`YYYY-MM`), filling in the sessions.
 *
 * Weeks start on MONDAY, matching both locales this project ships (pl and en-GB
 * conventions) and the way an academy's own timetable reads. The leading blanks
 * are computed from the weekday of the 1st.
 *
 * Full days are RETURNED, not filtered out. US-15.1/AC2 tells a parent to pick a
 * different date of the same pattern, and that instruction is only actionable if
 * they can see which dates exist and are full versus which are open. Hiding them
 * makes a busy offer look like an empty one.
 */
export function buildMonthGrid(
  month: string,
  rows: AvailabilityRow[],
  timeZone: string,
): CalendarDay[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match?.[1] || !match[2]) {
    throw new Error(`month must be YYYY-MM, received: ${month}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);

  const byDay = new Map<string, CalendarSlot[]>();
  for (const row of rows) {
    const key = zonedDayKey(row.startTime, timeZone);
    const slots = byDay.get(key);
    if (slots) slots.push(toSlot(row, timeZone));
    else byDay.set(key, [toSlot(row, timeZone)]);
  }

  // Weekday of the 1st, 0 = Sunday from getUTCDay; shifted so Monday = 0.
  const firstWeekday = (new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay() + 6) % 7;
  const total = daysInMonth(year, monthIndex);

  const cells: CalendarDay[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ dayKey: null, dayOfMonth: null, slots: [], hasBookableSlot: false });
  }
  for (let day = 1; day <= total; day += 1) {
    const dayKey = `${year}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const slots = byDay.get(dayKey) ?? [];
    cells.push({
      dayKey,
      dayOfMonth: day,
      slots,
      hasBookableSlot: slots.some((slot) => slot.bookable),
    });
  }
  // Trailing blanks, so the grid is whole weeks and does not reflow its last row.
  while (cells.length % 7 !== 0) {
    cells.push({ dayKey: null, dayOfMonth: null, slots: [], hasBookableSlot: false });
  }

  return cells;
}

/**
 * The month (`YYYY-MM`, in the academy's zone) a calendar should open on.
 *
 * Not "this month" unconditionally: an offer whose season starts in September is
 * an empty grid in July, and an empty grid reads as "no classes" rather than
 * "look further ahead". So it opens on the current month when that month has a
 * session, and otherwise on the month of the first upcoming one.
 */
export function defaultMonth(rows: AvailabilityRow[], timeZone: string, now: Date): string {
  const { year, month } = zonedPartsOf(now, timeZone);
  const current = `${year}-${String(month).padStart(2, "0")}`;

  const earliest = rows.reduce<Date | null>(
    (min, row) => (min === null || row.startTime < min ? row.startTime : min),
    null,
  );
  if (!earliest) return current;

  const first = zonedDayKey(earliest, timeZone).slice(0, 7);
  return first > current ? first : current;
}
