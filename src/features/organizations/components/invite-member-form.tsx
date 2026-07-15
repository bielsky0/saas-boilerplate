"use client";

import { useActionState } from "react";

import { Button, FormField, Input } from "@/components/ui";
import { inviteMemberAction } from "../actions";
import type { ActionState } from "../actions";

const initialState: ActionState = {};

/**
 * Invite-member form (spec 3.3). Posts the org `slug` so the action resolves the
 * tenant and enforces `members.invite` server-side. Sending is neutral — it never
 * reveals whether the email already has an account.
 */
export function InviteMemberForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <div className="flex-1">
        <FormField label="Email" htmlFor="invite-email">
          <Input id="invite-email" name="email" type="email" required autoComplete="off" />
        </FormField>
      </div>
      <FormField label="Role" htmlFor="invite-role">
        <select
          id="invite-role"
          name="role"
          defaultValue="member"
          className="h-9 rounded-md border border-black/15 bg-transparent px-2 text-sm dark:border-white/20"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>

      {state.error ? (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="w-full text-sm text-green-700 dark:text-green-400">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
