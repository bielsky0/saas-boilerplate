"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { createRecurrenceAction, updateRecurrenceAction } from "../actions";

const initial: FormState = {};

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type RecurrenceDefaults = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  trainerId: string | null;
  capacity: number;
  locationId: string | null;
  isRecurring: boolean;
  occurrencesCount: number | null;
  startDate: string;
};

/**
 * Pattern form (langlion §2.2, EPIK 3) — the form whose SAVE generates a season.
 *
 * There is no "Generate" button anywhere in this UI, and its absence is the
 * feature (US-3.1/AC1). Saving a recurring pattern enqueues the work; saving a
 * one-off creates its single session inline. The admin's mental model is "I
 * described the classes", not "I described them and then asked for them".
 *
 * `occurrencesCount` is revealed only when the pattern repeats, because it is
 * meaningless otherwise and the action rejects the combination anyway. Editing it
 * upward later is how a season is extended — idempotent through the §4.4 unique,
 * so only the missing dates are created (US-3.2/AC1).
 */
export function RecurrenceForm({
  groupTypeId,
  trainers,
  locations,
  defaults,
}: {
  groupTypeId: string;
  trainers: { id: string; label: string }[];
  locations: { id: string; name: string }[];
  defaults?: RecurrenceDefaults;
}) {
  const t = useTranslations("groups.recurrences");
  const td = useTranslations("groups.days");
  const isEdit = Boolean(defaults);
  const [state, action, pending] = useActionState(
    isEdit ? updateRecurrenceAction : createRecurrenceAction,
    initial,
  );
  const [repeats, setRepeats] = useState(defaults?.isRecurring ?? true);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  const fieldId = (name: string) => `rec-${defaults?.id ?? "new"}-${name}`;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="groupTypeId" value={groupTypeId} />
      {defaults ? <input type="hidden" name="recurrenceId" value={defaults.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <FormField label={t("form.dayOfWeek")} htmlFor={fieldId("day")}>
          <Select name="dayOfWeek" defaultValue={String(defaults?.dayOfWeek ?? 1)}>
            <SelectTrigger id={fieldId("day")} aria-label={t("form.dayOfWeek")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {td(String(day) as "0" | "1" | "2" | "3" | "4" | "5" | "6")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/*
          A wall clock in the academy's zone, not an instant — the conversion to
          UTC happens at generation time so it survives DST (US-1.2/AC1). See the
          header of `schema/group-type-recurrences.ts`.
        */}
        <FormField label={t("form.startTime")} htmlFor={fieldId("start")}>
          <Input
            id={fieldId("start")}
            name="startTime"
            type="time"
            defaultValue={defaults?.startTime ?? "17:00"}
            required
          />
        </FormField>

        <FormField label={t("form.durationMinutes")} htmlFor={fieldId("duration")}>
          <Input
            id={fieldId("duration")}
            name="durationMinutes"
            type="number"
            min={1}
            defaultValue={defaults?.durationMinutes ?? 60}
            required
          />
        </FormField>

        <FormField label={t("form.capacity")} htmlFor={fieldId("capacity")}>
          <Input
            id={fieldId("capacity")}
            name="capacity"
            type="number"
            min={1}
            defaultValue={defaults?.capacity ?? 10}
            required
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("form.trainer")} htmlFor={fieldId("trainer")}>
          <Select name="trainerId" defaultValue={defaults?.trainerId ?? ""}>
            <SelectTrigger id={fieldId("trainer")} aria-label={t("form.trainer")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("form.noTrainer")}</SelectItem>
              {trainers.map((trainer) => (
                <SelectItem key={trainer.id} value={trainer.id}>
                  {trainer.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t("form.location")} htmlFor={fieldId("location")}>
          <Select name="locationId" defaultValue={defaults?.locationId ?? ""}>
            <SelectTrigger id={fieldId("location")} aria-label={t("form.location")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Empty = inherit the group type's default (§2.12's three steps). */}
              <SelectItem value="">{t("form.inheritLocation")}</SelectItem>
              {locations.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t("form.startDate")} htmlFor={fieldId("startDate")}>
          <Input
            id={fieldId("startDate")}
            name="startDate"
            type="date"
            defaultValue={defaults?.startDate ?? new Date().toISOString().slice(0, 10)}
            required
          />
        </FormField>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isRecurring"
            checked={repeats}
            onChange={(event) => setRepeats(event.target.checked)}
            className="accent-primary size-4"
          />
          {t("form.isRecurring")}
        </label>

        {repeats ? (
          <FormField label={t("form.occurrencesCount")} htmlFor={fieldId("occurrences")}>
            <Input
              id={fieldId("occurrences")}
              name="occurrencesCount"
              type="number"
              min={1}
              defaultValue={defaults?.occurrencesCount ?? 30}
              className="w-32"
              required
            />
          </FormField>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {isEdit
            ? pending
              ? t("form.saving")
              : t("form.save")
            : pending
              ? t("form.submitting")
              : t("form.submit")}
        </Button>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      </div>
    </form>
  );
}
