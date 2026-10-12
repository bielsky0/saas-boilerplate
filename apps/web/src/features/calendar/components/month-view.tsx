"use client";

// React Imports
import React, { useEffect, useMemo, useRef, useState } from "react";
import { enUS, pl } from "date-fns/locale";
import { useLocale } from "next-intl";

// Third-party Imports
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

// Type Imports
import type { CalendarEvent } from "../types";

// Component Imports
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarCell } from "./calendar-cell";
import { EventItem } from "./event-item";

// Hook Imports
import { useEventVisibility } from "../hooks/use-event-visibility";

// Util Imports
import {
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  sortEvents,
} from "../calendar-utils";

// Data Imports
import { DefaultStartHour, EventGap, EventHeight } from "../constants";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  /** Zoned "today" from the composition layer (display zone, not system zone). */
  today: Date;
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

export function MonthView({
  currentDate,
  events,
  today,
  onEventSelect,
  onEventCreate,
}: MonthViewProps) {
  const locale = useLocale();
  const dateLocale = locale === "pl" ? pl : enUS;
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(startOfWeek(new Date()), i);

      return format(date, "EEE", { locale: dateLocale });
    });
  }, [dateLocale]);

  const weeks = useMemo(() => {
    const result = [];
    let week = [];

    for (let i = 0; i < days.length; i++) {
      week.push(days[i]);

      if (week.length === 7 || i === days.length - 1) {
        result.push(week);
        week = [];
      }
    }

    return result;
  }, [days]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const [openPopoverDay, setOpenPopoverDay] = useState<string | null>(null);
  const suppressCellClickRef = useRef(false);

  const handleMoreEventsPopoverOpenChange = (
    open: boolean,
    eventDetails: { reason: string; event: Event },
    day: Date,
  ) => {
    const dayKey = format(day, "yyyy-MM-dd");

    if (open) {
      setOpenPopoverDay(dayKey);

      return;
    }

    setOpenPopoverDay(null);

    // Prevent the dismiss click from reaching the day cell underneath (opens create dialog)
    if (eventDetails.reason === "outside-press") {
      eventDetails.event.preventDefault();
      suppressCellClickRef.current = true;
      window.setTimeout(() => {
        suppressCellClickRef.current = false;
      }, 0);
    }
  };

  const handleCellClick = (day: Date, event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressCellClickRef.current || event.defaultPrevented) return;

    const target = event.target as HTMLElement;

    if (
      target.closest("[data-calendar-event]") ||
      target.closest('[data-slot="popover-trigger"]') ||
      target.closest('[data-slot="popover-content"]')
    ) {
      return;
    }

    const startTime = new Date(day);

    startTime.setHours(DefaultStartHour, 0, 0);
    onEventCreate(startTime);
  };

  const [isMounted, setIsMounted] = useState(false);

  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventHeight: EventHeight,
    eventGap: EventGap,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  return (
    <div data-slot="month-view" className="contents">
      <div className="border-border/70 grid grid-cols-7 border-b">
        {weekdays.map((day) => (
          <div key={day} className="text-muted-foreground/70 py-2 text-center text-sm">
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr">
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="grid grid-cols-7 [&:last-child>*]:border-b-0">
            {week.map((day, dayIndex) => {
              if (!day) return null; // Skip if day is undefined

              const dayEvents = getEventsForDay(events, day);
              const spanningEvents = getSpanningEventsForDay(events, day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const allDayEvents = [...spanningEvents, ...dayEvents];
              const allEvents = getAllEventsForDay(events, day);

              const isReferenceCell = weekIndex === 0 && dayIndex === 0;

              const visibleCount = isMounted
                ? getVisibleEventCount(allDayEvents.length)
                : undefined;

              const hasMore = visibleCount !== undefined && allDayEvents.length > visibleCount;

              const remainingCount = hasMore ? allDayEvents.length - visibleCount : 0;

              return (
                <div
                  key={day.toString()}
                  className="border-border/70 data-outside-cell:bg-muted/25 data-outside-cell:text-muted-foreground/70 group border-b border-r last:border-r-0"
                  data-today={isSameDay(day, today) || undefined}
                  data-outside-cell={!isCurrentMonth || undefined}
                >
                  <CalendarCell
                    className="overflow-visible"
                    onClick={(event) => handleCellClick(day, event)}
                  >
                    <div className="group-data-today:bg-primary group-data-today:text-primary-foreground mt-1 inline-flex size-6 items-center justify-center rounded-full text-sm">
                      {format(day, "d", { locale: dateLocale })}
                    </div>
                    <div
                      ref={isReferenceCell ? contentRef : null}
                      className="min-h-[calc((var(--event-height)+var(--event-gap))*2)] overflow-visible sm:min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
                    >
                      {sortEvents(allDayEvents).map((event, index) => {
                        const eventStart = new Date(event.start);
                        const eventEnd = new Date(event.end);
                        const isFirstDay = isSameDay(day, eventStart);
                        const isLastDay = isSameDay(day, eventEnd);
                        const spansRight = !isLastDay && dayIndex < 6;
                        const spansLeft = !isFirstDay && dayIndex > 0;

                        const isHidden = isMounted && visibleCount && index >= visibleCount;

                        if (!visibleCount) return null;

                        if (!isFirstDay) {
                          return (
                            <div
                              key={`spanning-${event.id}-${day.toISOString().slice(0, 10)}`}
                              className="w-full aria-hidden:hidden"
                              aria-hidden={isHidden ? "true" : undefined}
                            >
                              <EventItem
                                onClick={(e) => handleEventClick(event, e)}
                                event={event}
                                view="month"
                                isFirstDay={isFirstDay}
                                isLastDay={isLastDay}
                                spansLeft={spansLeft}
                                spansRight={spansRight}
                              />
                            </div>
                          );
                        }

                        return (
                          <div
                            key={event.id}
                            className="w-full aria-hidden:hidden"
                            aria-hidden={isHidden ? "true" : undefined}
                          >
                            <EventItem
                              event={event}
                              view="month"
                              onClick={(e) => handleEventClick(event, e)}
                              isFirstDay={isFirstDay}
                              isLastDay={isLastDay}
                              spansLeft={spansLeft}
                              spansRight={spansRight}
                            />
                          </div>
                        );
                      })}

                      {hasMore && (
                        <Popover
                          modal
                          open={openPopoverDay === format(day, "yyyy-MM-dd")}
                          onOpenChange={(open, eventDetails) =>
                            handleMoreEventsPopoverOpenChange(open, eventDetails, day)
                          }
                        >
                          <PopoverTrigger
                            render={
                              <button
                                className="focus-visible:border-ring focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 mt-[var(--event-gap)] flex h-[var(--event-height)] w-full select-none items-center overflow-hidden px-1 text-left text-[10px] outline-none backdrop-blur-md transition focus-visible:ring-[3px] sm:px-2 sm:text-xs"
                                onClick={(e) => e.stopPropagation()}
                              />
                            }
                          >
                            <span>
                              + {remainingCount} <span className="max-sm:sr-only">more</span>
                            </span>
                          </PopoverTrigger>
                          <PopoverContent
                            align="center"
                            className="max-w-52 p-3"
                            style={
                              {
                                "--event-height": `${EventHeight}px`,
                              } as React.CSSProperties
                            }
                          >
                            <div className="space-y-2">
                              <div className="text-sm font-medium">
                                {format(day, "EEE d", { locale: dateLocale })}
                              </div>
                              <div className="space-y-1">
                                {sortEvents(allEvents).map((event) => {
                                  const eventStart = new Date(event.start);
                                  const eventEnd = new Date(event.end);
                                  const isFirstDay = isSameDay(day, eventStart);
                                  const isLastDay = isSameDay(day, eventEnd);

                                  return (
                                    <EventItem
                                      key={event.id}
                                      onClick={(e) => handleEventClick(event, e)}
                                      event={event}
                                      view="month"
                                      isFirstDay={isFirstDay}
                                      isLastDay={isLastDay}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </CalendarCell>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
