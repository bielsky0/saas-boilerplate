"use client";

import { useTranslations } from "next-intl";

import RegistrationForm from "./registration-demo-form";
import ValidationModesDemo from "./validation-demos";

export function FormValidationDemos() {
  const t = useTranslations("demo");

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("validation.reportTitle")}</h2>
        <RegistrationForm />
      </div>
      <ValidationModesDemo />
    </div>
  );
}
