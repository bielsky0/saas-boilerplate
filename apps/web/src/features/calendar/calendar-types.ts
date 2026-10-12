/**
 * Calendar DTO mirrors (etap 5, faza 5.3).
 *
 * Source of truth: `apps/api/src/calendar/calendar.service.ts`. Times cross the
 * wire as ISO strings (always UTC instants); the views convert to wall time in
 * the display zone via `date-fns-tz` at the composition boundary.
 */

export type CalendarScope = { kind: "personal" } | { kind: "org"; slug: string };

export interface CalendarEventDto {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: string;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventsPage {
  items: CalendarEventDto[];
}

/**
 * The five categories AdminCN ships. Never enforced as a closed set by the
 * backend (`kind` is free-form text there) — this tuple only bounds the picker
 * and gives the form schema a literal union.
 */
export const EVENT_KINDS = ["family", "business", "personal", "holiday", "etc"] as const;

export type EventKind = (typeof EVENT_KINDS)[number];
