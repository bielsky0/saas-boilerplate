"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { signUpAction, type FormState } from "../actions";

const initialState: FormState = {};

export function SignUpForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const t = useTranslations("auth");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <FormField label={t("fields.nameOptional")} htmlFor="name">
        <Input id="name" name="name" type="text" autoComplete="name" />
      </FormField>
      <FormField label={t("fields.email")} htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
      </FormField>
      <FormField
        label={t("fields.password")}
        htmlFor="password"
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
        <p className="text-muted-foreground text-xs">{t("shared.passwordHint")}</p>
      </FormField>

      {/*
        Whole-form message. Still rendered alongside the field errors above, and
        not replaced by them: most failures here have no field at all (rate
        limiting, a rejected password the engine judged weak, a generic adapter
        error), and those must stay visible.
      */}
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("signUp.submitting") : t("signUp.submit")}
      </Button>

      <p className="text-muted-foreground text-sm">
        {t("signUp.haveAccount")}{" "}
        <Link href="/login" className="text-foreground font-medium underline">
          {t("shared.logInLink")}
        </Link>
      </p>
    </form>
  );
}
