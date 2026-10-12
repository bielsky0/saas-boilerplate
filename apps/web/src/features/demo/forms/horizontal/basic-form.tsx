"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";

/**
 * Horizontal basic form (etap 5, faza 5.1). Label left, control right
 * (`sm:grid-cols-6`). Submit is a no-op — layout demo.
 */
export function HorizontalBasicForm() {
  const t = useTranslations("demo");

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="gap-6">
        <Field className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <FieldLabel htmlFor="demo-h-name">{t("forms.labels.name")}</FieldLabel>
          <Input id="demo-h-name" className="sm:col-span-5" placeholder="John Doe" />
        </Field>

        <Field className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <FieldLabel htmlFor="demo-h-company">{t("forms.labels.company")}</FieldLabel>
          <Input id="demo-h-company" className="sm:col-span-5" placeholder="ACME Inc." />
        </Field>

        <Field className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <FieldLabel htmlFor="demo-h-email">{t("forms.labels.email")}</FieldLabel>
          <InputGroup className="sm:col-span-5">
            <InputGroupInput id="demo-h-email" placeholder="john.doe" />
            <InputGroupAddon align="inline-end" className="text-foreground font-normal">
              @example.com
            </InputGroupAddon>
          </InputGroup>
        </Field>

        <Field className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <FieldLabel htmlFor="demo-h-phone">{t("forms.labels.phone")}</FieldLabel>
          <Input
            id="demo-h-phone"
            className="sm:col-span-5"
            type="tel"
            placeholder="658 799 8941"
          />
        </Field>

        <Field className="grid grid-cols-1 items-start gap-2 sm:grid-cols-6">
          <FieldLabel htmlFor="demo-h-message">{t("forms.labels.message")}</FieldLabel>
          <Textarea
            id="demo-h-message"
            className="sm:col-span-5"
            placeholder="Hi, do you have a moment to talk?"
            rows={4}
          />
        </Field>

        <Field className="grid grid-cols-1 sm:grid-cols-6">
          <div className="sm:col-start-2">
            <Button type="submit">{t("forms.send")}</Button>
          </div>
        </Field>
      </FieldGroup>
    </form>
  );
}
