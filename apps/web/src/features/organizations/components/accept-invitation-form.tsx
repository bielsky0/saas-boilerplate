"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button, FormMessage } from "@/components/ui";
import { useRouter } from "@/lib/i18n/navigation";
import { acceptInvitation } from "../client";

/**
 * Accept-invitation button (spec 3.3, faza 2.2). Nest re-validates the token
 * and, on success, answers the org slug — the client navigates into the org.
 * Works for both an existing user who just signed in and a brand-new user who
 * just registered — both arrive here with a session.
 */
export function AcceptInvitationForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useTranslations("organizations.accept");
  const te = useTranslations("organizations");
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await acceptInvitation(token);
      if (result.ok) {
        router.push(`/orgs/${result.data.slug}`);
        return;
      }
      setError(te("errors.invitationInvalid"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </form>
  );
}
