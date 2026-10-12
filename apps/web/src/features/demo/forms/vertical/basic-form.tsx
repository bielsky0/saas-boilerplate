"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Vertical basic form (etap 5, faza 5.1). Layout ported from AdminCN; labels
 * translated, placeholders stay sample data (demo page, cf. DemoBanner).
 * Submit is intentionally a no-op — demo of layout, not a flow.
 */
export function VerticalBasicForm() {
  const t = useTranslations("demo");

  const field = (id: string, label: string, placeholder: string, extra?: string) => (
    <Field className={`gap-2 ${extra ?? ""}`}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} placeholder={placeholder} />
    </Field>
  );

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {field("demo-v-first-name", t("forms.labels.firstName"), "John")}
        {field("demo-v-last-name", t("forms.labels.lastName"), "Doe")}
        {field("demo-v-mobile", t("forms.labels.mobile"), "+1 (555) 123-4567")}
        {field("demo-v-pincode", t("forms.labels.pincode"), "Postal Code")}
        {field("demo-v-address", t("forms.labels.address"), "123 Main St", "sm:col-span-2")}
        {field("demo-v-landmark", t("forms.labels.landmark"), "Near Central Park", "sm:col-span-2")}
        {field("demo-v-city", t("forms.labels.city"), "New York")}
        {field("demo-v-state", t("forms.labels.state"), "NY")}
      </FieldGroup>

      <div className="mt-8">
        <Button type="submit">{t("forms.save")}</Button>
      </div>
    </form>
  );
}
