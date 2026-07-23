"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, ConfirmDialog } from "@/components/ui";
import { deactivateTrainerAction } from "../actions";

export function DeactivateTrainerButton({
  trainerUserId,
  hasFutureSessions,
}: {
  trainerUserId: string;
  hasFutureSessions: boolean;
}) {
  const t = useTranslations("staffPanel");
  const [state, action, pending] = useActionState(deactivateTrainerAction, {});

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm" disabled={hasFutureSessions}>
            {t("deactivate", { defaultValue: "Deactivate" })}
          </Button>
        }
        title={t("deactivate", { defaultValue: "Deactivate trainer" })}
        description={
          <p>{hasFutureSessions ? t("trainerHasFutureSessions", { defaultValue: "Trainer has future sessions — resolve them first." }) : t("deactivateConfirm", { defaultValue: "Are you sure? The trainer will lose access to the academy panel." })}</p>
        }
        confirmLabel={pending ? t("deactivating", { defaultValue: "Deactivating…" }) : t("deactivate", { defaultValue: "Deactivate" })}
        confirmForm="deactivate-trainer-form"
        confirmVariant="destructive"
        disabled={pending || hasFutureSessions}
      />
      <form id="deactivate-trainer-form" action={action}>
        <input type="hidden" name="trainerUserId" value={trainerUserId} />
      </form>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </div>
  );
}
