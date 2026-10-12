"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { enUS, pl } from "date-fns/locale";
import {
  CalendarCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarScope } from "./calendar-types";
import { DayView } from "./components/day-view";
import { EventFormSheet } from "./components/event-form";
import { MonthView } from "./components/month-view";
import { WeekView } from "./components/week-view";
import { DefaultStartHour, EventGap, EventHeight, WeekCellsHeight } from "./constants";
import { useCalendarEvents } from "./hooks/use-calendar-events";
import {
  browserTimeZone,
  toInstantIso,
  toWallTime,
  wallDateKey,
  wallFromParts,
  zonedNow,
} from "./time";
import type { CalendarEvent, CalendarView } from "./types";

/**
 * Calendar composition (etap 5, faza 5.3).
 *
 * The boundary where UTC storage meets the DISPLAY ZONE: events arrive as ISO
 * instants, are converted once to wall-time Dates in `timeZone`, and every view
 * below works on those. `timeZone` is the org's for an org calendar, or the
 * browser's for the personal one — resolved here, never assumed. Rendering is
 * mount-gated because both the browser zone and "today" are unknowable during
 * SSR; the server paints a skeleton instead of a grid that would hydrate wrong.
 *
 * The visible range (with a one-day pad) drives the query key, so paging
 * months/weeks refetches exactly what is shown — the server only ever returns
 * events that intersect the window.
 */
export function CalendarApp({ scope, timeZone }: { scope: CalendarScope; timeZone?: string }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const dateLocale = locale === "pl" ? pl : enUS;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const tz = timeZone ?? browserTimeZone();

  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(() => zonedNow(tz));
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const now = useMemo(() => zonedNow(tz, new Date(nowTick)), [tz, nowTick]);

  const [editor, setEditor] = useState<{
    open: boolean;
    event: CalendarEvent | null;
    start: Date | null;
  }>({ open: false, event: null, start: null });

  const range = useMemo(() => {
    if (view === "month") {
      return {
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
      };
    }
    if (view === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      };
    }
    return { start: startOfDay(currentDate), end: addDays(startOfDay(currentDate), 1) };
  }, [currentDate, view]);

  // Wall bounds → UTC instants, padded a day each way so events that merely
  // overlap the edge still arrive (the server stabs with `startsAt < to AND
  // endsAt >= from`).
  const fromISO = useMemo(() => toInstantIso(addDays(range.start, -1), tz), [range, tz]);
  const toISO = useMemo(() => toInstantIso(addDays(range.end, 1), tz), [range, tz]);

  const query = useCalendarEvents(scope, fromISO, toISO);

  const events: CalendarEvent[] = useMemo(
    () =>
      (query.data?.items ?? []).map((dto) => ({
        id: dto.id,
        title: dto.title,
        description: dto.description ?? undefined,
        start: toWallTime(dto.startsAt, tz),
        end: toWallTime(dto.endsAt, tz),
        allDay: dto.allDay,
        color: dto.kind as CalendarEvent["color"],
        location: dto.location ?? undefined,
      })),
    [query.data, tz],
  );

  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      switch (e.key.toLowerCase()) {
        case "m":
          setView("month");
          break;
        case "w":
          setView("week");
          break;
        case "d":
          setView("day");
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted]);

  const viewTitle = useMemo(() => {
    if (view === "month") return format(currentDate, "LLLL yyyy", { locale: dateLocale });
    if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      if (isSameMonth(start, end)) return format(start, "LLLL yyyy", { locale: dateLocale });
      return `${format(start, "LLL", { locale: dateLocale })} - ${format(end, "LLL yyyy", { locale: dateLocale })}`;
    }
    // `PPPP` is fully localized (weekday + date); the hand-assembled variants
    // read wrong in Polish ("pon. października 12") because `MMMM` is the
    // genitive/inline form, not the standalone one.
    return format(currentDate, "PPPP", { locale: dateLocale });
  }, [currentDate, view, dateLocale]);

  const goToToday = () => setCurrentDate(zonedNow(tz));
  const goToPrevious = () =>
    setCurrentDate((current) =>
      view === "month"
        ? subMonths(current, 1)
        : view === "week"
          ? subWeeks(current, 1)
          : addDays(current, -1),
    );
  const goToNext = () =>
    setCurrentDate((current) =>
      view === "month"
        ? addMonths(current, 1)
        : view === "week"
          ? addWeeks(current, 1)
          : addDays(current, 1),
    );

  const openCreate = (start: Date) => setEditor({ open: true, event: null, start });
  const openEdit = (event: CalendarEvent) => setEditor({ open: true, event, start: null });
  const defaultStart = () => wallFromParts(wallDateKey(currentDate), `${DefaultStartHour}:00`);

  const timeZoneLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date(nowTick))
        .find((part) => part.type === "timeZoneName")?.value;
    } catch {
      return tz;
    }
  }, [locale, tz, nowTick]);

  if (!mounted) {
    return (
      <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-[32rem] w-full" />
      </div>
    );
  }

  return (
    <div className="bg-card flex flex-col rounded-lg border">
      <div
        className="has-data-[slot=month-view]:flex-1 flex flex-col"
        style={
          {
            "--event-height": `${EventHeight}px`,
            "--event-gap": `${EventGap}px`,
            "--week-cells-height": `${WeekCellsHeight}px`,
          } as React.CSSProperties
        }
      >
        <div className="flex flex-col gap-2 p-2 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                className="max-sm:hidden md:max-lg:h-8"
                onClick={() => openCreate(defaultStart())}
              >
                <PlusIcon size={16} aria-hidden="true" />
                <span>{t("newEvent")}</span>
              </Button>
              <Button
                size="icon-sm"
                className="sm:hidden"
                aria-label={t("newEvent")}
                onClick={() => openCreate(defaultStart())}
              >
                <PlusIcon size={16} aria-hidden="true" />
              </Button>
              <Button variant="outline" className="max-sm:hidden md:max-lg:h-8" onClick={goToToday}>
                <CalendarCheckIcon size={16} aria-hidden="true" />
                <span>{t("today")}</span>
              </Button>
              <Button variant="outline" size="icon-sm" className="sm:hidden" onClick={goToToday}>
                <CalendarCheckIcon size={16} aria-hidden="true" />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goToPrevious}
                aria-label={t("previous")}
              >
                <ChevronLeftIcon size={16} aria-hidden="true" />
              </Button>
              <h2 className="min-w-0 text-sm font-semibold sm:text-lg md:text-xl">{viewTitle}</h2>
              <Button variant="ghost" size="icon-sm" onClick={goToNext} aria-label={t("next")}>
                <ChevronRightIcon size={16} aria-hidden="true" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="max-sm:h-8!" />}>
                  <span>
                    <span className="sm:hidden" aria-hidden="true">
                      {t(`views.${view}`).charAt(0).toUpperCase()}
                    </span>
                    <span className="max-sm:sr-only">{t(`views.${view}`)}</span>
                  </span>
                  <ChevronDownIcon className="-me-1 opacity-60" size={16} aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-32">
                  <DropdownMenuItem onClick={() => setView("month")}>
                    {t("views.month")} <DropdownMenuShortcut>M</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setView("week")}>
                    {t("views.week")} <DropdownMenuShortcut>W</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setView("day")}>
                    {t("views.day")} <DropdownMenuShortcut>D</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            {t("timeZone", { zone: timeZoneLabel ?? tz })}
          </p>
        </div>

        <div className="flex flex-1 flex-col">
          {query.isError ? (
            <div className="p-4">
              <Alert role="alert" variant="warning">
                {t("error")}
              </Alert>
            </div>
          ) : query.isPending ? (
            <Skeleton className="m-4 h-[28rem]" />
          ) : (
            <>
              {view === "month" && (
                <MonthView
                  currentDate={currentDate}
                  events={events}
                  today={now}
                  onEventSelect={openEdit}
                  onEventCreate={openCreate}
                />
              )}
              {view === "week" && (
                <WeekView
                  currentDate={currentDate}
                  events={events}
                  today={now}
                  onEventSelect={openEdit}
                  onEventCreate={openCreate}
                />
              )}
              {view === "day" && (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  today={now}
                  onEventSelect={openEdit}
                  onEventCreate={openCreate}
                />
              )}
            </>
          )}
        </div>
      </div>

      <EventFormSheet
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        scope={scope}
        timeZone={tz}
        event={editor.event}
        initialStart={editor.start}
      />
    </div>
  );
}
