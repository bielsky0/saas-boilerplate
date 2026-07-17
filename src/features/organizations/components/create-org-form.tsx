"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { createOrganizationAction } from "../actions";
import type { ActionState } from "../actions";

const initialState: ActionState = {};

/**
 * Create-organization form (spec 3.2). The slug is optional — the server derives
 * and de-duplicates it from the name when omitted. On success the action
 * redirects to the new org, so no success state is rendered here.
 */
export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);
  const t = useTranslations("organizations");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormField label={t("fields.orgName")} htmlFor="name">
        <Input id="name" name="name" required autoComplete="organization" />
      </FormField>
      <FormField label={t("fields.slugOptional")} htmlFor="slug">
        <Input id="slug" name="slug" placeholder={t("fields.slugPlaceholder")} />
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
