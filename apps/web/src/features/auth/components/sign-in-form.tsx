"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { LOCALE_COOKIE, withLocale } from "@/lib/i18n/config";
import {
  safeCallbackUrl,
  signInLocale,
  signInWithNest,
  type AuthCode,
  type AuthFormState,
} from "../client";

export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, setState] = useState<AuthFormState>({});
  const [pending, setPending] = useState(false);
  const t = useTranslations("auth");

  function messageFor(code: AuthCode): string {
    // ONE key per outcome — the client half of the §2.1 invariant. In
    // particular `invalidCredentials` covers parse failures, unknown emails
    // AND wrong passwords with a single string no translator can split.
    switch (code) {
      case "INVALID_CREDENTIALS":
        return t("errors.invalidCredentials");
      case "RATE_LIMITED":
        return t("errors.tooManyAttempts");
      case "ACCOUNT_SUSPENDED":
        return t("errors.accountSuspended");
      default:
        return t("errors.generic");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await signInWithNest({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      if (result.ok) {
        // The API is framework-independent: it returns the stored language
        // and the CLIENT lands itself — no server hop. The cookie is the
        // client's own (a Vue SPA does the same with its router + storage):
        // deliberately NOT httpOnly, so no web route is needed to write it.
        // No backfill — a null locale sets nothing and the browser keeps
        // negotiating. The navigation IS the next request, so the cookie
        // (set synchronously below) already applies to it.
        const target = safeCallbackUrl(callbackUrl);
        const locale = signInLocale(result);
        if (locale) {
          document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          window.location.assign(withLocale(target, locale));
          return;
        }
        window.location.assign(target);
        return;
      }
      setState({ error: messageFor(result.code) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <FormField label={t("fields.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField label={t("fields.password")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <p className="text-xs">
          <Link href="/forgot-password" className="text-muted-foreground underline">
            {t("signIn.forgot")}
          </Link>
        </p>
      </FormField>

      {/*
        `state.error` is already translated — the code became a sentence in
        `messageFor` above, the one place that mapping lives. Never re-translate
        it here: the anti-enumeration guarantee (§2.1) lives at that mapping.
      */}
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("signIn.submitting") : t("signIn.submit")}
      </Button>

      <p className="text-muted-foreground text-sm">
        {t("signIn.needAccount")}{" "}
        <Link href="/signup" className="text-foreground font-medium underline">
          {t("signIn.signUpLink")}
        </Link>
      </p>
    </form>
  );
}
