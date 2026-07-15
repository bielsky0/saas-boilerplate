"use client";

import { useActionState } from "react";

import { Button, FormField, Input } from "@/components/ui";
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

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormField label="Organization name" htmlFor="name">
        <Input id="name" name="name" required autoComplete="organization" />
      </FormField>
      <FormField label="Slug (optional)" htmlFor="slug">
        <Input id="slug" name="slug" placeholder="auto-generated from name" />
      </FormField>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}
