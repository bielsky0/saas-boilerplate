import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Display-zone conversion helpers (etap 5, faza 5.3).
 *
 * Storage is UTC (`timestamptz`); the calendar renders in the ACTIVE context's
 * zone — an org's `timezone`, or the browser's for the personal calendar. Every
 * view component therefore works on "wall-time Dates": a `Date` whose LOCAL
 * getters already read in the display zone. `toZonedTime` produces exactly that
 * from an instant, and `fromZonedTime` reverses it. `date-fns` is allowed in
 * this feature only (etap decision).
 */

/** Zoned wall time for "now" in the given IANA zone. */
export function zonedNow(timeZone: string, now: Date = new Date()): Date {
  return toZonedTime(now, timeZone);
}

/** UTC instant → wall-time Date in the display zone. */
export function toWallTime(instant: Date | string, timeZone: string): Date {
  return toZonedTime(typeof instant === "string" ? new Date(instant) : instant, timeZone);
}

/** Wall-time Date (display zone) → UTC ISO instant for the API. */
export function toInstantIso(wall: Date, timeZone: string): string {
  return fromZonedTime(wall, timeZone).toISOString();
}

/** Stable `yyyy-MM-dd` key for a wall-time Date. */
export function wallDateKey(wall: Date): string {
  const y = wall.getFullYear();
  const m = `${wall.getMonth() + 1}`.padStart(2, "0");
  const d = `${wall.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Stable `HH:mm` time key for a wall-time Date. */
export function wallTimeKey(wall: Date): string {
  const h = `${wall.getHours()}`.padStart(2, "0");
  const m = `${wall.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
}

/** Combine `yyyy-MM-dd` + `HH:mm` wall values into a wall-time Date. */
export function wallFromParts(dateKey: string, timeKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = timeKey.split(":").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

/** The browser's IANA zone. Only ever called client-side. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
