"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { acceptInvitationAction } from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/**
 * Accept-invitation button (spec 3.3). Shown to an authenticated user holding a
 * valid invite link; the action re-validates the token and, on success,
 * redirects into the org. Works for both an existing user who just signed in and
 * a brand-new user who just registered — both arrive here with a session.
 */
export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
