"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { createGradeFieldAction } from "../actions";

const initial: FormState = {};

/** Define a new grade field, for this offer or ad-hoc for this session (Faza 6). */
export function GradeFieldForm({
  groupTypeId,
  sessionId,
}: {
  groupTypeId: string;
  sessionId: string;
}) {
  const t = useTranslations("grades");
  const [state, action, pending] = useActionState(createGradeFieldAction, initial);
  const [scope, setScope] = useState<"group_type" | "session">("session");
  const [fieldType, setFieldType] = useState<"numeric" | "scale" | "text">("text");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="groupTypeId" value={scope === "group_type" ? groupTypeId : ""} />
      <input type="hidden" name="sessionId" value={scope === "session" ? sessionId : ""} />

      <FormField label={t("form.name")} htmlFor="grade-field-name">
        <Input id="grade-field-name" name="name" required className="h-8" />
      </FormField>

      <FormField label={t("form.fieldType")} htmlFor="grade-field-type">
        <Select
          name="fieldType"
          value={fieldType}
          onValueChange={(value) => setFieldType(value as typeof fieldType)}
        >
          <SelectTrigger id="grade-field-type" aria-label={t("form.fieldType")} className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="numeric">{t("fieldType.numeric")}</SelectItem>
            <SelectItem value="scale">{t("fieldType.scale")}</SelectItem>
            <SelectItem value="text">{t("fieldType.text")}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField label={t("form.scope")} htmlFor="grade-field-scope">
        <Select value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
          <SelectTrigger id="grade-field-scope" aria-label={t("form.scope")} className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="session">{t("form.scopeSession")}</SelectItem>
            <SelectItem value="group_type">{t("form.scopeGroupType")}</SelectItem>
          </SelectContent>
        </Select>
        {/* Server-visible mirror of the client-only Select above. */}
        <input type="hidden" name="scope" value={scope} />
      </FormField>

      {fieldType !== "text" ? (
        <>
          <FormField label={t("form.minValue")} htmlFor="grade-field-min">
            <Input id="grade-field-min" name="minValue" type="number" className="h-8 w-20" />
          </FormField>
          <FormField label={t("form.maxValue")} htmlFor="grade-field-max">
            <Input id="grade-field-max" name="maxValue" type="number" className="h-8 w-20" />
          </FormField>
        </>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        {t("form.submit")}
      </Button>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
