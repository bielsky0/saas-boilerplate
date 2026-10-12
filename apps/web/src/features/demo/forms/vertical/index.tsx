"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { VerticalBasicForm } from "./basic-form";
import { VerticalBasicFormWithIcon } from "./basic-form-with-icon";

export function VerticalFormDemos() {
  const t = useTranslations("demo");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("forms.basic")}</h2>
          <Card>
            <CardContent>
              <VerticalBasicForm />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("forms.withIcon")}</h2>
          <Card>
            <CardContent>
              <VerticalBasicFormWithIcon />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
