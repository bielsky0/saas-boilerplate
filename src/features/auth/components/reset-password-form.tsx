"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { resetPasswordAction, type ResetPasswordState } from "../actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const t = useTranslations("auth");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormField label={t("fields.newPassword")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-muted-foreground text-xs">{t("shared.passwordHint")}</p>
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>

      <p className="text-muted-foreground text-sm">
        {t("resetPassword.signsYouOut")}{" "}
        <Link href="/login" className="text-foreground font-medium underline">
          {t("shared.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
