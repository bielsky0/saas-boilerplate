"use client";

import { useActionState, useEffect, useId } from "react";

import { Button, ConfirmDialog, FormMessage, toast } from "@/components/ui";
import { deleteOrganizationAction, type ActionState } from "../actions";

const initial: ActionState = {};

/**
 * Organization-level admin controls (spec 6.2): deletion.
 *
 * Cosmetic gating only — the action re-checks `requireSuperAdmin()` server-side.
 */
export function OrgActions({
  organizationId,
  name,
  memberCount,
  deleted,
}: {
  organizationId: string;
  name: string;
  memberCount: number;
  deleted: boolean;
}) {
  const [state, remove, pending] = useActionState(deleteOrganizationAction, initial);
  const formId = useId();

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  if (deleted) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <form id={formId} action={remove}>
        <input type="hidden" name="organizationId" value={organizationId} />
      </form>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="destructive" size="sm" disabled={pending}>
            {pending ? "Deleting…" : "Delete organization"}
          </Button>
        }
        title={`Delete ${name}?`}
        description={`The organization is soft-deleted and retained before permanent removal. ${memberCount} member${
          memberCount === 1 ? "" : "s"
        } lose access immediately. User accounts are not deleted.`}
        confirmLabel="Delete organization"
        confirmForm={formId}
        disabled={pending}
      />
      {state.error ? <FormMessage className="text-xs">{state.error}</FormMessage> : null}
    </div>
  );
}
