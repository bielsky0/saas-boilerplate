"use client";

import {
  Building2Icon,
  MapIcon,
  MapPinIcon,
  PhoneIcon,
  SignpostIcon,
  UserIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

/**
 * Vertical basic form with icons (etap 5, faza 5.1). Same fields as the plain
 * variant, each in an `InputGroup` with a decorative icon. Submit is a no-op.
 */
export function VerticalBasicFormWithIcon() {
  const t = useTranslations("demo");

  const field = (id: string, label: string, icon: ReactNode, input: ReactNode) => (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          {icon}
          <span className="sr-only">{label}</span>
        </InputGroupAddon>
        {input}
      </InputGroup>
    </Field>
  );

  const text = (id: string, placeholder: string, type?: string) => (
    <InputGroupInput id={id} placeholder={placeholder} type={type} />
  );

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {field(
          "demo-vi-first-name",
          t("forms.labels.firstName"),
          <UserIcon className="size-4" />,
          text("demo-vi-first-name", "John"),
        )}
        {field(
          "demo-vi-last-name",
          t("forms.labels.lastName"),
          <UserIcon className="size-4" />,
          text("demo-vi-last-name", "Doe"),
        )}
        {field(
          "demo-vi-mobile",
          t("forms.labels.mobile"),
          <PhoneIcon className="size-4" />,
          text("demo-vi-mobile", "+1 (555) 123-4567", "tel"),
        )}
        {field(
          "demo-vi-pincode",
          t("forms.labels.pincode"),
          <MapPinIcon className="size-4" />,
          text("demo-vi-pincode", "Postal Code"),
        )}
        {field(
          "demo-vi-address",
          t("forms.labels.address"),
          <MapIcon className="size-4" />,
          text("demo-vi-address", "123 Main St"),
        )}
        {field(
          "demo-vi-landmark",
          t("forms.labels.landmark"),
          <SignpostIcon className="size-4" />,
          text("demo-vi-landmark", "Near Central Park"),
        )}
        {field(
          "demo-vi-city",
          t("forms.labels.city"),
          <Building2Icon className="size-4" />,
          text("demo-vi-city", "New York"),
        )}
        {field(
          "demo-vi-state",
          t("forms.labels.state"),
          <MapPinIcon className="size-4" />,
          text("demo-vi-state", "NY"),
        )}
      </FieldGroup>

      <div className="mt-8">
        <Button type="submit">{t("forms.save")}</Button>
      </div>
    </form>
  );
}
