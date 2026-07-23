"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, ConfirmDialog } from "@/components/ui";
import { cancelSessionAction } from "../actions";

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations("schedule");
  const [state, action, pending] = useActionState(cancelSessionAction, {});

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm">
            {t("cancelSession")}
          </Button>
        }
        title={t("cancelSession")}
        description={
          <>
            <p>{t("sessionCancelConfirm")}</p>
            <p className="font-semibold">{t("sessionCancelWarning")}</p>
          </>
        }
        confirmLabel={pending ? t("cancellingSession") : t("cancelSession")}
        confirmForm="cancel-session-form"
        confirmVariant="destructive"
        disabled={pending}
      />
      <form id="cancel-session-form" action={action}>
        <input type="hidden" name="sessionId" value={sessionId} />
      </form>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </div>
  );
}
