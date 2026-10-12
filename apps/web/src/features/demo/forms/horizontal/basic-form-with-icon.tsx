"use client";

import { Building2Icon, MailIcon, MessageSquare, PhoneIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";

/**
 * Horizontal basic form with icons (etap 5, faza 5.1). Same fields as the
 * plain horizontal variant. Submit is a no-op — layout demo.
 */
export function HorizontalBasicFormWithIcon() {
  const t = useTranslations("demo");

  const field = (id: string, label: string, control: ReactNode) => (
    <Field className="grid grid-cols-1 gap-2 sm:grid-cols-6">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="sm:col-span-5">{control}</div>
    </Field>
  );

  const withIcon = (id: string, icon: ReactNode, input: ReactNode) => (
    <InputGroup>
      <InputGroupAddon>{icon}</InputGroupAddon>
      {input}
    </InputGroup>
  );

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="gap-6">
        {field(
          "demo-hi-name",
          t("forms.labels.name"),
          withIcon(
            "demo-hi-name",
            <UserIcon className="size-4" />,
            <InputGroupInput id="demo-hi-name" type="text" placeholder="John Doe" />,
          ),
        )}
        {field(
          "demo-hi-company",
          t("forms.labels.company"),
          withIcon(
            "demo-hi-company",
            <Building2Icon className="size-4" />,
            <InputGroupInput id="demo-hi-company" placeholder="ACME Inc." />,
          ),
        )}
        {field(
          "demo-hi-email",
          t("forms.labels.email"),
          withIcon(
            "demo-hi-email",
            <MailIcon className="size-4" />,
            <InputGroupInput id="demo-hi-email" placeholder="john.doe@example.com" />,
          ),
        )}
        {field(
          "demo-hi-phone",
          t("forms.labels.phone"),
          withIcon(
            "demo-hi-phone",
            <PhoneIcon className="size-4" />,
            <InputGroupInput id="demo-hi-phone" type="tel" placeholder="658 799 8941" />,
          ),
        )}
        <Field className="grid grid-cols-1 items-start gap-2 sm:grid-cols-6">
          <FieldLabel htmlFor="demo-hi-message">{t("forms.labels.message")}</FieldLabel>
          <div className="sm:col-span-5">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <MessageSquare className="size-4" />
              </InputGroupAddon>
              <InputGroupTextarea
                id="demo-hi-message"
                placeholder="Hi, do you have a moment to talk?"
                rows={4}
              />
            </InputGroup>
          </div>
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
