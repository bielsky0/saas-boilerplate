"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { requestPasswordResetAction, type ForgotPasswordState } from "../actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  const t = useTranslations("auth");

  // The confirmation is deliberately identical whether or not the address has an
  // account (spec 2.1). Do not "improve" this into "no account found" — that turns
  // the form into a free account-enumeration oracle. There is exactly ONE key here
  // for the same reason: a translator never sees a variant to diverge from.
  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{t("forgotPassword.sent")}</p>
        <p className="text-muted-foreground text-sm">
          {t("forgotPassword.expiry")}{" "}
          <Link href="/login" className="text-foreground font-medium underline">
            {t("shared.backToLogin")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormField label={t("fields.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
      </Button>

      <p className="text-muted-foreground text-sm">
        {t("forgotPassword.remembered")}{" "}
        <Link href="/login" className="text-foreground font-medium underline">
          {t("shared.logInLink")}
        </Link>
      </p>
    </form>
  );
}
