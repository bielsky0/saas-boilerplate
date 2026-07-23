"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, ConfirmDialog } from "@/components/ui";
import { massReassignTrainerAction } from "../actions";

interface TrainerOption {
  userId: string;
  name: string | null;
  email: string;
}

export function MassReassignDialog({
  fromTrainerId,
  trainers,
}: {
  fromTrainerId: string;
  trainers: TrainerOption[];
}) {
  const t = useTranslations("schedule");
  const [state, action, pending] = useActionState(massReassignTrainerAction, {});

  const otherTrainers = trainers.filter((tr) => tr.userId !== fromTrainerId);

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm">
            {t("massReassign")}
          </Button>
        }
        title={t("massReassign")}
        description={<p>{t("massReassignConfirm")}</p>}
        confirmLabel={pending ? t("massReassigning") : t("massReassign")}
        confirmForm="mass-reassign-form"
        disabled={pending || otherTrainers.length === 0}
      />
      <form id="mass-reassign-form" action={action}>
        <input type="hidden" name="fromTrainerId" value={fromTrainerId} />
        <select
          name="targetTrainerId"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          required
        >
          <option value="">{t("targetTrainer")}</option>
          {otherTrainers.map((tr) => (
            <option key={tr.userId} value={tr.userId}>
              {tr.name ?? tr.email}
            </option>
          ))}
        </select>
      </form>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </div>
  );
}
