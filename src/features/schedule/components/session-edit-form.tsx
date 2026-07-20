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
import { updateSessionAction } from "../actions";

const initial: FormState = {};

/**
 * Per-session adjustment (langlion §3.4/AC9, US-22.3, US-14.4).
 *
 * The three edits that legitimately apply to ONE date rather than to its pattern:
 * move it, move it to another room, or make space for one more participant.
 *
 * The inputs are `datetime-local`, which has no time zone of its own — so the
 * page hands them values ALREADY EXPRESSED in the academy's zone, and the action
 * receives them back the same way. Feeding a raw UTC instant into this control
 * would render the wrong hour to an admin sitting anywhere else, and they would
 * "correct" it into being genuinely wrong.
 */
export function SessionEditForm({
  slug,
  sessionId,
  startLocal,
  endLocal,
  locationId,
  capacity,
  locations,
}: {
  slug: string;
  sessionId: string;
  /** `YYYY-MM-DDTHH:mm` in the academy's zone — see header. */
  startLocal: string;
  endLocal: string;
  locationId: string | null;
  capacity: number;
  locations: { id: string; name: string }[];
}) {
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const t = useTranslations("schedule");

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setAttempt((value) => value + 1);
          setOpen(true);
        }}
      >
        {t("edit.open")}
      </Button>
    );
  }

  return (
    <SessionEditFields
      key={attempt}
      slug={slug}
      sessionId={sessionId}
      startLocal={startLocal}
      endLocal={endLocal}
      locationId={locationId}
      capacity={capacity}
      locations={locations}
      onCancel={() => setOpen(false)}
    />
  );
}

function SessionEditFields({
  slug,
  sessionId,
  startLocal,
  endLocal,
  locationId,
  capacity,
  locations,
  onCancel,
}: {
  slug: string;
  sessionId: string;
  startLocal: string;
  endLocal: string;
  locationId: string | null;
  capacity: number;
  locations: { id: string; name: string }[];
  onCancel: () => void;
}) {
  const t = useTranslations("schedule");
  const [state, action, pending] = useActionState(updateSessionAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  // Collapse on success, derived from the action's own result rather than pushed
  // into local state by an effect — see `location-forms.tsx` for the same shape.
  if (state.success) {
    return (
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t("edit.open")}
      </Button>
    );
  }

  const id = (field: string) => `session-${sessionId}-${field}`;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("edit.start")} htmlFor={id("start")}>
          <Input
            id={id("start")}
            name="startTime"
            type="datetime-local"
            defaultValue={startLocal}
          />
        </FormField>
        <FormField label={t("edit.end")} htmlFor={id("end")}>
          <Input id={id("end")} name="endTime" type="datetime-local" defaultValue={endLocal} />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("table.location")} htmlFor={id("location")}>
          <Select name="locationId" defaultValue={locationId ?? ""}>
            <SelectTrigger id={id("location")} aria-label={t("table.location")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("noLocation")}</SelectItem>
              {locations.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/*
          US-14.4/AC1 — raising this is the ONLY legitimate way to admit an extra
          participant to a full session. There is deliberately no "force" control
          anywhere near it: no role may exceed the number that is here.
        */}
        <FormField
          label={t("table.capacity")}
          htmlFor={id("capacity")}
          hint={t("edit.capacityHint")}
        >
          <Input
            id={id("capacity")}
            name="capacity"
            type="number"
            min={1}
            defaultValue={capacity}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("edit.saving") : t("edit.save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("edit.cancel")}
        </Button>
      </div>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
