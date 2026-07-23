"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, ConfirmDialog } from "@/components/ui";
import { massMoveBookingsAction } from "../actions";

interface TargetSessionOption {
  id: string;
  startTime: Date;
  groupTypeName: string;
}

export function MoveBookingsDialog({
  sourceSessionId,
  targetSessions,
}: {
  sourceSessionId: string;
  targetSessions: TargetSessionOption[];
}) {
  const t = useTranslations("schedule");
  const [state, action, pending] = useActionState(massMoveBookingsAction, {});

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm">
            {t("massMoveBookings")}
          </Button>
        }
        title={t("massMoveBookings")}
        description={<p>{t("massMoveBookingsDesc")}</p>}
        confirmLabel={pending ? t("massMoving") : t("massMoveBookings")}
        confirmForm="mass-move-form"
        disabled={pending || targetSessions.length === 0}
      />
      <form id="mass-move-form" action={action}>
        <input type="hidden" name="sourceSessionId" value={sourceSessionId} />
        <select
          name="targetSessionId"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          required
        >
          <option value="">{t("targetSession")}</option>
          {targetSessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.startTime.toLocaleString()} — {s.groupTypeName}
            </option>
          ))}
        </select>
      </form>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </div>
  );
}
