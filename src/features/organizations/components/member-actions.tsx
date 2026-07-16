"use client";

import { useActionState, useEffect, useId } from "react";

import {
  Button,
  ConfirmDialog,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import { removeMemberAction, updateMemberRoleAction } from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/**
 * Per-member controls (spec §3.4): change role + remove. Rendered only when the
 * viewer has the matching permission (cosmetic gating — the actions re-check
 * `members.update_role` / `members.remove` and the last-owner rule server-side).
 * Removal is confirmed in a dialog; failures stay inline, successes toast.
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
  const removeFormId = useId();

  useEffect(() => {
    if (roleState.success) toast.success(roleState.success);
  }, [roleState]);

  useEffect(() => {
    if (removeState.success) toast.success(removeState.success);
  }, [removeState]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        {canUpdateRole ? (
          <form action={roleAction} className="flex items-center gap-1">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="membershipId" value={membershipId} />
            <Select name="role" defaultValue={currentRole}>
              <SelectTrigger className="h-8 w-32" aria-label="Member role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="ghost" size="sm" disabled={rolePending}>
              {rolePending ? "Saving…" : "Save"}
            </Button>
          </form>
        ) : null}

        {canRemove ? (
          <>
            <form id={removeFormId} action={removeAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="membershipId" value={membershipId} />
            </form>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={removePending}>
                  {removePending ? "Removing…" : "Remove"}
                </Button>
              }
              title="Remove this member?"
              description="They lose access to this organization immediately. Their user account is not deleted."
              confirmLabel="Remove member"
              confirmForm={removeFormId}
              disabled={removePending}
            />
          </>
        ) : null}
      </div>
      {roleState.error ? <FormMessage className="text-xs">{roleState.error}</FormMessage> : null}
      {removeState.error ? (
        <FormMessage className="text-xs">{removeState.error}</FormMessage>
      ) : null}
    </div>
  );
}
