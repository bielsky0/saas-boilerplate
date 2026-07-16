"use client";

import { useActionState, useEffect, useId } from "react";

import { Button, ConfirmDialog, FormField, FormMessage, Input, toast } from "@/components/ui";
import {
  deleteOrganizationAction,
  leaveOrganizationAction,
  updateOrganizationAction,
} from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/** Edit org name + slug (spec §3.2). Re-checks `organization.update` server-side. */
export function OrgSettingsForm({ slug, name }: { slug: string; name: string }) {
  const [state, action, pending] = useActionState(updateOrganizationAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <FormField label="Organization name" htmlFor="org-name">
        <Input id="org-name" name="name" defaultValue={name} required />
      </FormField>
      <FormField label="Slug" htmlFor="org-slug">
        <Input id="org-slug" name="newSlug" defaultValue={slug} />
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/** Soft-delete the org (spec §11.3). Re-checks `organization.delete` server-side. */
export function DeleteOrgButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(deleteOrganizationAction, initial);
  const formId = useId();

  return (
    <div className="flex flex-col gap-2">
      <form id={formId} action={action}>
        <input type="hidden" name="slug" value={slug} />
      </form>
      <div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete organization"}
            </Button>
          }
          title="Delete this organization?"
          description="This removes access for every member. You can't undo this from the UI."
          confirmLabel="Delete organization"
          confirmForm={formId}
          disabled={pending}
        />
      </div>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </div>
  );
}

/** Leave the org (spec §3.4). Blocked for the sole owner (server-side). */
export function LeaveOrgButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(leaveOrganizationAction, initial);
  const formId = useId();

  return (
    <div className="flex flex-col gap-2">
      <form id={formId} action={action}>
        <input type="hidden" name="slug" value={slug} />
      </form>
      <div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" disabled={pending}>
              {pending ? "Leaving…" : "Leave organization"}
            </Button>
          }
          title="Leave this organization?"
          description="You'll lose access to its resources until someone invites you back."
          confirmLabel="Leave organization"
          confirmForm={formId}
          disabled={pending}
        />
      </div>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </div>
  );
}
