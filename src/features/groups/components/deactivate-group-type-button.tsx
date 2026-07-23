"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, ConfirmDialog } from "@/components/ui";
import { deactivateGroupTypeAction } from "../actions";

export function DeactivateGroupTypeButton({
  groupTypeId,
  blocked,
}: {
  groupTypeId: string;
  blocked: boolean;
}) {
  const t = useTranslations("groups");
  const [state, action, pending] = useActionState(deactivateGroupTypeAction, {});

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm" disabled={blocked}>
            {t("deactivate")}
          </Button>
        }
        title={t("deactivate")}
        description={
          blocked
            ? <p>{t("deactivateBlocked")}</p>
            : <p>{t("deactivateConfirm")}</p>
        }
        confirmLabel={pending ? t("deactivating") : t("deactivate")}
        confirmForm="deactivate-group-type-form"
        confirmVariant="destructive"
        disabled={pending || blocked}
      />
      <form id="deactivate-group-type-form" action={action}>
        <input type="hidden" name="groupTypeId" value={groupTypeId} />
      </form>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </div>
  );
}
