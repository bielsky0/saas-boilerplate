"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { useState, type FormEvent } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { invalid } from "@/lib/validation";
import { safeCallbackUrl, signUpWithNest, verifySentUrl, type AuthFormState } from "../client";
import { signUpSchema } from "../schema";

export function SignUpForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, setState] = useState<AuthFormState>({});
  const [pending, setPending] = useState(false);
  const t = useTranslations("auth");
  const tv = useTranslations("auth.validation");
  const locale = useLocale();
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? "") || undefined,
    };

    // Instant, translated field errors — the same schema (and the same
    // factory) the API enforces, in the page's language. Safe to name fields
    // here: these are FORMAT rules about a password the user just chose.
    const parsed = signUpSchema(tv).safeParse(values);
    if (!parsed.success) {
      setState(invalid(parsed.error, t("errors.generic")));
      return;
    }

    setPending(true);
    try {
      const result = await signUpWithNest({ ...parsed.data, locale });
      if (result.ok) {
        // Neutral outcome for fresh and already-registered emails alike —
        // the API resolves both as success, so the target is identical.
        router.push(verifySentUrl(safeCallbackUrl(callbackUrl)));
        return;
      }
      if (result.code === "RATE_LIMITED") {
        setState({ error: t("errors.tooManyAttempts") });
        return;
      }
      if (result.code === "WEAK_PASSWORD") {
        setState({ error: t("errors.weakPassword") });
        return;
      }
      // 422 backstop (hand-built request): per-field detail if the API sent
      // any, generic message otherwise.
      setState({ error: t("errors.generic"), fieldErrors: result.fieldErrors });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
        Whole-form message alongside the field errors: most failures here have
        no field at all (rate limiting, a weak password, a generic error).
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
