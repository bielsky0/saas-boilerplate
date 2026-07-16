"use client";

import { useActionState, useEffect, useId } from "react";

import { Button, ConfirmDialog, FormMessage, toast } from "@/components/ui";
import { revokeInvitationAction } from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/** Revoke a pending invitation (spec §3.3). Re-checks `invitations.revoke` server-side. */
export function RevokeInviteButton({ slug, invitationId }: { slug: string; invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, initial);
  const formId = useId();

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <div className="flex flex-col items-end gap-1">
      <form id={formId} action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="invitationId" value={invitationId} />
      </form>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm" disabled={pending}>
            {pending ? "Revoking…" : "Revoke"}
          </Button>
        }
        title="Revoke this invitation?"
        description="The invitation link stops working immediately."
        confirmLabel="Revoke invitation"
        confirmForm={formId}
        disabled={pending}
      />
      {state.error ? <FormMessage className="text-xs">{state.error}</FormMessage> : null}
    </div>
  );
}
