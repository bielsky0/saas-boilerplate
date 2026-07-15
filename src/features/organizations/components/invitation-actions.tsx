"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { revokeInvitationAction } from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/** Revoke a pending invitation (spec 3.3). Re-checks `invitations.revoke` server-side. */
export function RevokeInviteButton({
  slug,
  invitationId,
}: {
  slug: string;
  invitationId: string;
}) {
  const [state, action, pending] = useActionState(revokeInvitationAction, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
