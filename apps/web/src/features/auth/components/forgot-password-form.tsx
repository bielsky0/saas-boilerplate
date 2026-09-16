"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { requestResetWithNest, type ForgotFormState } from "../client";

export function ForgotPasswordForm() {
  const [state, setState] = useState<ForgotFormState>({});
  const [pending, setPending] = useState(false);
  const t = useTranslations("auth");

  // The confirmation is deliberately identical whether or not the address has
  // an account (spec 2.1). Do not "improve" this into "no account found".
  // There is exactly ONE outcome here, so no client-side validation either:
  // even "that isn't an email" must resolve to the same screen.
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      await requestResetWithNest({ email: String(formData.get("email") ?? "") });
      // Always the sent screen — the API resolves success for unknown and
      // malformed addresses too (and skips the send silently when limited).
      setState({ sent: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
