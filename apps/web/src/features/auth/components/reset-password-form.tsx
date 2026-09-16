"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { useState, type FormEvent } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { invalid } from "@/lib/validation";
import { confirmResetWithNest, type AuthFormState } from "../client";
import { resetPasswordSchema } from "../schema";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<AuthFormState>({});
  const [pending, setPending] = useState(false);
  const t = useTranslations("auth");
  const tv = useTranslations("auth.validation");
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = {
      token,
      password: String(formData.get("password") ?? ""),
    };

    // Same reasoning as sign-up: the password rules are format rules about a
    // value the user just typed. The `token` field also appears in
    // `fieldErrors`, which is harmless — it is a hidden input.
    const parsed = resetPasswordSchema(tv).safeParse(values);
    if (!parsed.success) {
      setState(invalid(parsed.error, t("errors.generic")));
      return;
    }

    setPending(true);
    try {
      const result = await confirmResetWithNest({
        token: parsed.data.token,
        newPassword: parsed.data.password,
      });
      if (result.ok) {
        // Sessions are gone, so there is nothing to sign into — log in with
        // the password just chosen.
        router.push("/login?reset=success");
        return;
      }
      if (result.code === "INVALID_TOKEN") {
        setState({ error: t("errors.resetLinkExpired") });
        return;
      }
      if (result.code === "WEAK_PASSWORD") {
        setState({ error: t("errors.weakPassword") });
        return;
      }
      setState({ error: t("errors.generic"), fieldErrors: result.fieldErrors });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormField
        label={t("fields.newPassword")}
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
