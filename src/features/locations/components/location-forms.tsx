"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { Button, FormField, FormMessage, Input, toast } from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { createLocationAction, updateLocationAction } from "../actions";

const initial: FormState = {};

/**
 * Location forms (langlion §2.12, US-22.1).
 *
 * Both post the org `slug` so the action resolves the tenant and re-checks
 * `locations.manage` server-side; nothing here is a permission boundary. The
 * page already hides these for viewers without the permission, which is
 * cosmetic by design (spec §4.2).
 */
export function CreateLocationForm() {
  const t = useTranslations("locations");
  const [state, action, pending] = useActionState(createLocationAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <FormField label={t("form.name")} htmlFor="location-name">
          <Input id="location-name" name="name" required />
        </FormField>
      </div>
      <div className="flex-1">
        <FormField label={t("form.address")} htmlFor="location-address">
          <Input id="location-address" name="address" placeholder={t("form.addressHint")} />
        </FormField>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("form.submitting") : t("form.submit")}
      </Button>
      {state.error ? <FormMessage className="w-full">{state.error}</FormMessage> : null}
    </form>
  );
}

/**
 * Inline edit, expanded on demand.
 *
 * Kept in the row rather than behind a dialog: a location is two short fields,
 * and a modal for two fields is more ceremony than the edit deserves.
 */
export function EditLocationForm(props: {
  locationId: string;
  name: string;
  address: string | null;
}) {
  const t = useTranslations("locations");
  // `attempt` remounts the inner form on each open, which RESETS its action state.
  // That is what lets "collapse after a successful save" be derived from the
  // action's own result instead of pushed into it by an effect — reopening starts
  // from a pristine state rather than one still reporting the previous success.
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);

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

  return <EditLocationFields key={attempt} {...props} onCancel={() => setOpen(false)} />;
}

function EditLocationFields({
  locationId,
  name,
  address,
  onCancel,
}: {
  locationId: string;
  name: string;
  address: string | null;
  onCancel: () => void;
}) {
  const t = useTranslations("locations");
  const [state, action, pending] = useActionState(updateLocationAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  // Derived, not stored: a successful save collapses the row back to its button.
  // The saved values are already on screen — the page revalidated — so keeping the
  // inputs open would only invite a second identical submit.
  if (state.success) {
    return (
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t("edit.open")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end justify-end gap-2">
      <input type="hidden" name="locationId" value={locationId} />
      <Input name="name" defaultValue={name} aria-label={t("form.name")} className="w-40" />
      <Input
        name="address"
        defaultValue={address ?? ""}
        aria-label={t("form.address")}
        className="w-48"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("edit.saving") : t("edit.save")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t("edit.cancel")}
      </Button>
      {state.error ? <FormMessage className="w-full text-xs">{state.error}</FormMessage> : null}
    </form>
  );
}
