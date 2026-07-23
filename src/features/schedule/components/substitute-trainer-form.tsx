"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import { substituteTrainerAction } from "../actions";

interface TrainerOption {
  userId: string;
  name: string | null;
  email: string;
}

export function SubstituteTrainerForm({
  sessionId,
  currentTrainerId,
  trainers,
}: {
  sessionId: string;
  currentTrainerId?: string | null;
  trainers: TrainerOption[];
}) {
  const t = useTranslations("schedule");
  const [state, action, pending] = useActionState(substituteTrainerAction, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <select
        name="trainerId"
        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
      >
        <option value="">{t("noTrainerOption")}</option>
        {trainers
          .filter((tr) => tr.userId !== currentTrainerId)
          .map((tr) => (
            <option key={tr.userId} value={tr.userId}>
              {tr.name ?? tr.email}
            </option>
          ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("substituting") : t("substituteTrainer")}
      </Button>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
