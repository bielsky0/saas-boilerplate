"use client";

import { useActionState } from "react";

import { Button, FormField, Input } from "@/components/ui";
import {
  deleteOrganizationAction,
  leaveOrganizationAction,
  updateOrganizationAction,
} from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/** Edit org name + slug (spec 3.2). Re-checks `organization.update` server-side. */
export function OrgSettingsForm({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(updateOrganizationAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <FormField label="Organization name" htmlFor="org-name">
        <Input id="org-name" name="name" defaultValue={name} required />
      </FormField>
      <FormField label="Slug" htmlFor="org-slug">
        <Input id="org-slug" name="newSlug" defaultValue={slug} />
      </FormField>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {state.success}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/** Soft-delete the org (spec 11.3). Re-checks `organization.delete` server-side. */
export function DeleteOrgButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(deleteOrganizationAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Deleting…" : "Delete organization"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** Leave the org (spec 3.4). Blocked for the sole owner (server-side). */
export function LeaveOrgButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(leaveOrganizationAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Leaving…" : "Leave organization"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
