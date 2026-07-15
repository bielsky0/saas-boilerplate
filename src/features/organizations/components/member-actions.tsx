"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { removeMemberAction, updateMemberRoleAction } from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/**
 * Per-member controls (spec 3.4): change role + remove. Rendered only when the
 * viewer has the matching permission (cosmetic gating — the actions re-check
 * `members.update_role` / `members.remove` and the last-owner rule server-side).
 */
export function MemberActions({
  slug,
  membershipId,
  currentRole,
  canUpdateRole,
  canRemove,
}: {
  slug: string;
  membershipId: string;
  currentRole: string;
  canUpdateRole: boolean;
  canRemove: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, initial);
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, initial);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {canUpdateRole ? (
          <form action={roleAction} className="flex items-center gap-1">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="membershipId" value={membershipId} />
            <select
              name="role"
              defaultValue={currentRole}
              className="h-8 rounded-md border border-black/15 bg-transparent px-2 text-sm dark:border-white/20"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
            <Button type="submit" variant="ghost" disabled={rolePending}>
              {rolePending ? "Saving…" : "Save"}
            </Button>
          </form>
        ) : null}

        {canRemove ? (
          <form action={removeAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="membershipId" value={membershipId} />
            <Button type="submit" variant="ghost" disabled={removePending}>
              {removePending ? "Removing…" : "Remove"}
            </Button>
          </form>
        ) : null}
      </div>
      {roleState.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {roleState.error}
        </p>
      ) : null}
      {removeState.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {removeState.error}
        </p>
      ) : null}
    </div>
  );
}
