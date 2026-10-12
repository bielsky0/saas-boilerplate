"use client";

import { endOfWeek, isSameDay, isWithinInterval, startOfWeek } from "date-fns";

import { EndHour, StartHour } from "../constants";

/**
 * Current-time indicator position (etap 5, faza 5.3).
 *
 * Pure derivation: `now` is the ZONED wall-time from the composition layer (the
 * display zone, not the browser's), so all math below runs on plain wall-time
 * Dates and is zone-agnostic. The composition owns the once-a-minute ticker —
 * a second timer here would only desync the two.
 */
export function useCurrentTimeIndicator(currentDate: Date, view: "day" | "week", now: Date) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = (hours - StartHour) * 60 + minutes;
  const dayEndMinutes = (EndHour - StartHour) * 60;
  const currentTimePosition = (totalMinutes / dayEndMinutes) * 100;

  let currentTimeVisible = false;
  if (view === "day") {
    currentTimeVisible = isSameDay(now, currentDate);
  } else if (view === "week") {
    currentTimeVisible = isWithinInterval(now, {
      start: startOfWeek(currentDate, { weekStartsOn: 0 }),
      end: endOfWeek(currentDate, { weekStartsOn: 0 }),
    });
  }

  return { currentTimePosition, currentTimeVisible };
}
