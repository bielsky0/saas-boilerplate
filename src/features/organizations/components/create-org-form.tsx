"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createOrganizationAction } from "../actions";
import type { ActionState } from "../actions";

const initialState: ActionState = {};

/**
 * A native `<select>`, not the Radix `Select` primitive.
 *
 * This form submits through `useActionState`, so the browser builds the FormData
 * from the DOM. A native control is in that FormData for free; the Radix one
 * needs a shadow input to participate, which is machinery this form does not
 * otherwise need. Styled to match `Input` so the difference is invisible.
 */
function NativeSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: React.Ref<HTMLSelectElement> }) {
  return (
    <select
      className={cn(
        "border-input bg-background focus-visible:ring-ring focus-visible:ring-offset-background flex h-9 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The option lists come from ICU rather than a hand-kept array, so they track
 * tzdata and currency changes without anyone remembering to. Computed once at
 * module scope: they are constant for the lifetime of the tab.
 */
const TIME_ZONES = Intl.supportedValuesOf("timeZone");
const CURRENCIES = Intl.supportedValuesOf("currency");

/**
 * Create-organization form (spec 3.2; langlion §1.2).
 *
 * The slug stays optional — the server derives and de-duplicates it from the
 * name. Subdomain, time zone and currency do NOT, because they have no database
 * default on purpose (Constraint 5, US-24.1/AC1): an academy created with a
 * quietly wrong currency is a problem discovered much later, and currency is
 * effectively immutable once transactions exist. On success the action redirects
 * to the new org, so no success state is rendered here.
 */
export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);
  const t = useTranslations("organizations");
  const timezoneRef = useRef<HTMLSelectElement>(null);

  // Preselect the visitor's own zone — a suggestion they can see and override,
  // which is a different thing from a default nobody notices. Applied after mount
  // rather than during render because the server and the browser resolve
  // different zones, and a differing `selected` attribute is a hydration mismatch.
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezoneRef.current && TIME_ZONES.includes(local)) {
      timezoneRef.current.value = local;
    }
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormField label={t("fields.orgName")} htmlFor="name">
        <Input id="name" name="name" required autoComplete="organization" />
      </FormField>
      <FormField label={t("fields.slugOptional")} htmlFor="slug">
        <Input id="slug" name="slug" placeholder={t("fields.slugPlaceholder")} />
      </FormField>

      <FormField label={t("fields.subdomain")} htmlFor="subdomain">
        <Input id="subdomain" name="subdomain" required autoCapitalize="none" spellCheck={false} />
        <p className="text-muted-foreground text-xs">
          {t("fields.subdomainHint", { subdomain: "…" })}
        </p>
      </FormField>

      <FormField label={t("fields.timezone")} htmlFor="timezone">
        <NativeSelect id="timezone" name="timezone" required ref={timezoneRef} defaultValue="UTC">
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">{t("fields.timezoneHint")}</p>
      </FormField>

      <FormField label={t("fields.currency")} htmlFor="currency">
        <NativeSelect id="currency" name="currency" required defaultValue="PLN">
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">{t("fields.currencyHint")}</p>
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
