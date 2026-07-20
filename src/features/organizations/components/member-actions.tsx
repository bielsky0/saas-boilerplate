"use client";

import { useTranslations } from "next-intl";
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
import { assignableRole } from "../schema";
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
  const t = useTranslations("organizations");

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
              <SelectTrigger className="h-8 w-32" aria-label={t("members.roleLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Off the zod enum — see the note in invite-member-form.tsx. */}
                {assignableRole.options.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`roles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="ghost" size="sm" disabled={rolePending}>
              {rolePending ? t("members.saving") : t("members.save")}
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
                  {removePending ? t("members.removing") : t("members.remove")}
                </Button>
              }
              title={t("members.confirmRemoveTitle")}
              description={t("members.confirmRemoveBody")}
              confirmLabel={t("members.confirmRemoveAction")}
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
