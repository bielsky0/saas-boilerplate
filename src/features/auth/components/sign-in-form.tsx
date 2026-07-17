"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { signInAction, type FormState } from "../actions";

const initialState: FormState = {};

export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const t = useTranslations("auth");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
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
        `state.error` is already translated — it comes from the action, which is the
        one place an AuthErrorCode becomes a sentence. Never re-translate it here:
        the client has no idea which code produced it, and the anti-enumeration
        guarantee (§2.1) lives at that mapping, not at this render.
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
