"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import type { CalendarEventsPage, CalendarScope } from "../calendar-types";

/**
 * Calendar reads/writes (etap 5, faza 5.3).
 *
 * Range params are UTC ISO strings computed from the visible wall interval
 * (see `calendar-app.tsx`); the server stabs `[startsAt, endsAt)` against them.
 * Scope selects the tenant: personal account, or org by slug (same `org`
 * convention as notifications/storage). Mutations invalidate the whole
 * `calendar` subtree — visible ranges overlap, so key-scoped invalidation
 * would leave stale neighbours behind.
 */

export function scopeKey(scope: CalendarScope): string {
  return scope.kind === "personal" ? "personal" : `org:${scope.slug}`;
}

function scopeParams(scope: CalendarScope): Record<string, string> {
  return scope.kind === "personal" ? {} : { org: scope.slug };
}

export function useCalendarEvents(scope: CalendarScope, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: [...queryKeys.calendar.all, scopeKey(scope), fromISO, toISO],
    queryFn: () =>
      browserApi().get<CalendarEventsPage>("/v1/calendar/events", {
        query: { ...scopeParams(scope), from: fromISO, to: toISO },
      }),
  });
}

export interface EventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  kind?: string;
  location?: string;
}

function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
}

export function useCreateEvent(scope: CalendarScope) {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (input: EventInput) =>
      browserApi().post<{ id: string }>("/v1/calendar/events", {
        ...scopeParams(scope),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateEvent(scope: CalendarScope) {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EventInput> }) =>
      browserApi().patch<{ ok: true }>(`/v1/calendar/events/${encodeURIComponent(id)}`, input, {
        // The owner hint travels as a query param: a bare id cannot name its
        // tenant, and the server refuses to scan tenants (404 on mismatch).
        query: scopeParams(scope),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteEvent(scope: CalendarScope) {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: string) =>
      browserApi().del<{ ok: true }>(`/v1/calendar/events/${encodeURIComponent(id)}`, {
        query: scopeParams(scope),
      }),
    onSuccess: invalidate,
  });
}
