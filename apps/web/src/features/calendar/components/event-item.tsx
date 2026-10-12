"use client";

// React Imports
import { useMemo } from "react";

// Third-party Imports
import { differenceInMinutes, format, getMinutes, isPast } from "date-fns";
import { enUS, pl } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";

// Type Imports
import type { CalendarEvent } from "../types";

// Util Imports
import { cn } from "@/lib/utils";
import {
  getBorderRadiusClasses,
  getEventColorClasses,
  getMonthViewBleedClasses,
  getMonthViewEventPaddingClasses,
} from "../calendar-utils";

// Using date-fns format with custom formatting:
// 'h' - hours (1-12)
// 'a' - am/pm
// ':mm' - minutes with leading zero (only if the token 'mm' is present)
const formatTimeWithOptionalMinutes = (
  date: Date,
  dateLocale: typeof enUS,
  allDayLabel: string,
  allDay: boolean | undefined,
) => {
  if (allDay) return allDayLabel;
  return format(date, getMinutes(date) === 0 ? "ha" : "h:mma", {
    locale: dateLocale,
  }).toLowerCase();
};

interface EventWrapperProps {
  event: CalendarEvent;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
  currentTime?: Date;
}

// Shared wrapper component for event styling
function EventWrapper({
  event,
  isFirstDay = true,
  isLastDay = true,
  onClick,
  className,
  children,
  currentTime,
}: EventWrapperProps) {
  // Always use the currentTime (if provided) to determine if the event is in the past
  const displayEnd = currentTime
    ? new Date(
        new Date(currentTime).getTime() +
          (new Date(event.end).getTime() - new Date(event.start).getTime()),
      )
    : new Date(event.end);

  const isEventInPast = isPast(displayEnd);

  return (
    <button
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 data-past-event:line-through flex h-full w-full select-none text-left font-medium outline-none transition focus-visible:ring-[3px]",
        getEventColorClasses(event.color),
        getBorderRadiusClasses(isFirstDay, isLastDay),
        className,
      )}
      data-calendar-event
      data-past-event={isEventInPast || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface EventItemProps {
  event: CalendarEvent;
  view: "month" | "week" | "day";
  onClick?: (e: React.MouseEvent) => void;
  showTime?: boolean;
  currentTime?: Date;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  spansLeft?: boolean;
  spansRight?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function EventItem({
  event,
  view,
  onClick,
  showTime,
  currentTime,
  isFirstDay = true,
  isLastDay = true,
  spansLeft = false,
  spansRight = false,
  children,
  className,
}: EventItemProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const dateLocale = locale === "pl" ? pl : enUS;
  const allDayLabel = t("allDay");
  const fmt = (date: Date) =>
    formatTimeWithOptionalMinutes(date, dateLocale, allDayLabel, event.allDay);
  const displayStart = useMemo(() => {
    return currentTime || new Date(event.start);
  }, [currentTime, event.start]);

  const displayEnd = useMemo(() => {
    return currentTime
      ? new Date(
          new Date(currentTime).getTime() +
            (new Date(event.end).getTime() - new Date(event.start).getTime()),
        )
      : new Date(event.end);
  }, [currentTime, event.start, event.end]);

  // Calculate event duration in minutes
  const durationMinutes = useMemo(() => {
    return differenceInMinutes(displayEnd, displayStart);
  }, [displayStart, displayEnd]);

  const getEventTime = () => {
    if (event.allDay) return allDayLabel;

    // For short events (less than 45 minutes), only show start time
    if (durationMinutes < 45) {
      return fmt(displayStart);
    }

    // For longer events, show both start and end time
    return `${fmt(displayStart)} - ${fmt(displayEnd)}`;
  };

  if (view === "month") {
    const monthContent =
      children ??
      (isFirstDay ? (
        <span className="truncate">
          {!event.allDay && (
            <span className="truncate font-normal opacity-70 sm:text-[11px]">
              {fmt(displayStart)}{" "}
            </span>
          )}
          {event.title}
        </span>
      ) : null);

    return (
      <div className="relative mt-[var(--event-gap)] w-full">
        <EventWrapper
          event={event}
          isFirstDay={isFirstDay}
          isLastDay={isLastDay}
          onClick={onClick}
          className={cn(
            "relative h-[var(--event-height)] w-full min-w-0 items-center overflow-hidden text-[10px] sm:text-xs",
            getMonthViewBleedClasses(spansRight),
            getMonthViewEventPaddingClasses(spansLeft, spansRight),
            className,
          )}
          currentTime={currentTime}
        >
          {monthContent ? (
            <span className="relative z-10 block min-w-0 flex-1 overflow-hidden truncate">
              {monthContent}
            </span>
          ) : (
            <span className="sr-only">{event.title}</span>
          )}
        </EventWrapper>
      </div>
    );
  }

  return (
    <EventWrapper
      event={event}
      isFirstDay={isFirstDay}
      isLastDay={isLastDay}
      onClick={onClick}
      className={cn(
        "px-1 py-1 backdrop-blur-md sm:px-2",
        durationMinutes < 45 ? "items-center" : "flex-col",
        view === "week" ? "text-[10px] sm:text-xs" : "text-xs",
        className,
      )}
      currentTime={currentTime}
    >
      {durationMinutes < 45 ? (
        <div className="truncate">
          {event.title} {showTime && <span className="opacity-70">{fmt(displayStart)}</span>}
        </div>
      ) : (
        <>
          <div className="truncate font-medium">{event.title}</div>
          {showTime && (
            <div className="truncate font-normal opacity-70 sm:text-[11px]">{getEventTime()}</div>
          )}
        </>
      )}
    </EventWrapper>
  );
}
