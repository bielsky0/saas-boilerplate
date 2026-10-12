"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@repo/api-client";
import { endOfDay, startOfDay } from "date-fns";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormMessage, toast } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarScope } from "../calendar-types";
import { EVENT_KINDS } from "../calendar-types";
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from "../hooks/use-calendar-events";
import { eventFormSchema, type EventFormValues } from "../schema";
import { toInstantIso, wallDateKey, wallFromParts, wallTimeKey } from "../time";
import type { CalendarEvent } from "../types";

/**
 * Create / edit event sheet (etap 5, faza 5.3).
 *
 * RHF + Zod over the shared server mirror. The form speaks WALL time in the
 * display zone (`date` + `startTime` + `endTime`); the hooks convert to UTC
 * instants on submit, so the same event renders correctly for a colleague in
 * another zone. Editing opens the same sheet with values reversed back from the
 * stored instant. Delete lives here too — inside the edit affordance.
 */
export function EventFormSheet({
  open,
  onOpenChange,
  scope,
  timeZone,
  event,
  initialStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: CalendarScope;
  timeZone: string;
  event: CalendarEvent | null;
  initialStart: Date | null;
}) {
  const t = useTranslations("calendar");
  const tv = useTranslations("calendar.validation");
  const create = useCreateEvent(scope);
  const update = useUpdateEvent(scope);
  const remove = useDeleteEvent(scope);

  const schema = useMemo(
    () =>
      eventFormSchema({
        titleRequired: tv("titleRequired"),
        titleMax: tv("titleMax"),
        dateRequired: tv("dateRequired"),
        endAfterStart: tv("endAfterStart"),
        locationMax: tv("locationMax"),
        descriptionMax: tv("descriptionMax"),
      }),
    [tv],
  );

  const form = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      kind: "etc",
      location: "",
    },
  });

  // Async editor input → form. Re-seeded every time the sheet opens (or the
  // target event changes) so a cancelled edit never bleeds into the next open.
  useEffect(() => {
    if (!open) return;
    const base = event ? event.start : (initialStart ?? new Date());
    const baseEnd = event ? event.end : null;
    form.reset({
      title: event?.title ?? "",
      description: event?.description ?? "",
      date: wallDateKey(base),
      startTime: wallTimeKey(base),
      endTime: baseEnd
        ? wallTimeKey(baseEnd)
        : wallTimeKey(new Date(base.getTime() + 60 * 60 * 1000)),
      allDay: event?.allDay ?? false,
      kind: (event?.color ?? "etc") as EventFormValues["kind"],
      location: event?.location ?? "",
    });
  }, [open, event, initialStart, form]);

  const allDay = useWatch({ control: form.control, name: "allDay" });
  const busy = create.isPending || update.isPending || remove.isPending;

  async function onSubmit(values: EventFormValues) {
    const startWall = wallFromParts(values.date, values.startTime);
    const endWall = wallFromParts(values.date, values.endTime);
    const payload = {
      title: values.title,
      description: values.description || undefined,
      allDay: values.allDay,
      kind: values.kind,
      location: values.location || undefined,
      startsAt: toInstantIso(values.allDay ? startOfDay(startWall) : startWall, timeZone),
      endsAt: toInstantIso(values.allDay ? endOfDay(startWall) : endWall, timeZone),
    };
    try {
      if (event) {
        await update.mutateAsync({ id: event.id, input: payload });
        toast.success(t("toast.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("toast.created"));
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const issues = error.issues as Record<string, string[]> | undefined;
        const first = issues ? Object.entries(issues)[0] : undefined;
        if (first && first[0] in form.getValues()) {
          form.setError(first[0] as keyof EventFormValues, { message: first[1]?.[0] });
        } else {
          form.setError("root", { message: tv("generic") });
        }
        return;
      }
      form.setError("root", { message: tv("generic") });
    }
  }

  async function onDelete() {
    if (!event) return;
    try {
      await remove.mutateAsync(event.id);
      toast.success(t("toast.deleted"));
      onOpenChange(false);
    } catch {
      form.setError("root", { message: tv("generic") });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{event ? t("form.editTitle") : t("form.createTitle")}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          noValidate
        >
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <FormField
                label={t("form.title")}
                htmlFor="event-title"
                error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
              >
                <Input {...field} id="event-title" autoComplete="off" />
              </FormField>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField
                  label={t("form.date")}
                  htmlFor="event-date"
                  error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
                >
                  <Input {...field} id="event-date" type="date" />
                </FormField>
              )}
            />
            <Controller
              name="kind"
              control={form.control}
              render={({ field, fieldState }) => (
                <FormField
                  label={t("form.kind")}
                  htmlFor="event-kind"
                  error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
                >
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="event-kind" aria-labelledby="event-kind-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {t(`kinds.${kind}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
          </div>

          <Controller
            name="allDay"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="event-allday"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label htmlFor="event-allday">{t("form.allDay")}</Label>
              </div>
            )}
          />

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="startTime"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FormField
                    label={t("form.start")}
                    htmlFor="event-start"
                    error={
                      fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined
                    }
                  >
                    <Input {...field} id="event-start" type="time" />
                  </FormField>
                )}
              />
              <Controller
                name="endTime"
                control={form.control}
                render={({ field, fieldState }) => (
                  <FormField
                    label={t("form.end")}
                    htmlFor="event-end"
                    error={
                      fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined
                    }
                  >
                    <Input {...field} id="event-end" type="time" />
                  </FormField>
                )}
              />
            </div>
          ) : null}

          <Controller
            name="location"
            control={form.control}
            render={({ field, fieldState }) => (
              <FormField
                label={t("form.location")}
                htmlFor="event-location"
                error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
              >
                <Input {...field} id="event-location" autoComplete="off" />
              </FormField>
            )}
          />

          <Controller
            name="description"
            control={form.control}
            render={({ field, fieldState }) => (
              <FormField
                label={t("form.description")}
                htmlFor="event-description"
                error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
              >
                <Textarea {...field} id="event-description" rows={3} />
              </FormField>
            )}
          />

          {form.formState.errors.root ? (
            <FormMessage>{form.formState.errors.root.message}</FormMessage>
          ) : null}

          <SheetFooter className="mt-auto flex-row items-center justify-between gap-2 px-0">
            {event ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                <Trash2Icon className="size-4" aria-hidden="true" />
                {t("form.delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("form.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t("form.saving") : t("form.save")}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
