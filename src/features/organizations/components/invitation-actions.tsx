"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId } from "react";

import { Button, ConfirmDialog, FormMessage, toast } from "@/components/ui";
import { revokeInvitationAction } from "../actions";
import type { ActionState } from "../actions";

const initial: ActionState = {};

/** Revoke a pending invitation (spec §3.3). Re-checks `invitations.revoke` server-side. */
export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, initial);
  const formId = useId();
  const t = useTranslations("organizations.invitationActions");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <div className="flex flex-col items-end gap-1">
      <form id={formId} action={action}>
        <input type="hidden" name="invitationId" value={invitationId} />
      </form>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm" disabled={pending}>
            {pending ? t("revoking") : t("revoke")}
          </Button>
        }
        title={t("confirmTitle")}
        description={t("confirmBody")}
        confirmLabel={t("confirmAction")}
        confirmForm={formId}
        disabled={pending}
      />
      {state.error ? <FormMessage className="text-xs">{state.error}</FormMessage> : null}
    </div>
  );
}
