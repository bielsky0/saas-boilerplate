"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { Button, FormMessage, Input, toast } from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { enterGradeAction } from "../actions";

const initial: FormState = {};

/** One participant's value for one grade field — langlion §2.33, Faza 6. */
export function EnterGradeForm({
  bookingId,
  gradeFieldId,
  defaultValue,
  fieldType,
  minValue,
  maxValue,
}: {
  bookingId: string;
  gradeFieldId: string;
  defaultValue: string | null;
  fieldType: "numeric" | "scale" | "text";
  minValue: number | null;
  maxValue: number | null;
}) {
  const t = useTranslations("grades");
  const [state, action, pending] = useActionState(enterGradeAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="gradeFieldId" value={gradeFieldId} />
      <Input
        name="value"
        type={fieldType === "text" ? "text" : "number"}
        min={fieldType !== "text" ? (minValue ?? undefined) : undefined}
        max={fieldType !== "text" ? (maxValue ?? undefined) : undefined}
        defaultValue={defaultValue ?? ""}
        className="h-8 w-24"
        aria-label={t("form.value")}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("form.save")}
      </Button>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
