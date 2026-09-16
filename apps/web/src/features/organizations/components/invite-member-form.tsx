"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import { useRouter } from "@/lib/i18n/navigation";
import { isLocale } from "@/lib/i18n/config";
import { createInvitation } from "../client";

/**
 * Invite-member form (spec §3.3, faza 2.2). Posts to Nest, which resolves the
 * tenant and enforces `members.invite` server-side. Sending is neutral — it
 * never reveals whether the email already has an account. Success toasts and
 * refreshes the members list; validation errors stay inline.
 */
export function InviteMemberForm({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useTranslations("organizations");
  const locale = useLocale();
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "");
      const role = String(formData.get("role") || "member");
      const result = await createInvitation(
        slug,
        { email, role },
        isLocale(locale) ? locale : undefined,
      );
      if (result.ok) {
        toast.success(t("success.invitationSent", { email }));
        event.currentTarget.reset();
        router.refresh();
        return;
      }
      setError(t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <div className="flex-1">
        <FormField label={t("fields.email")} htmlFor="invite-email">
          <Input id="invite-email" name="email" type="email" required autoComplete="off" />
        </FormField>
      </div>
      <FormField label={t("fields.role")} htmlFor="invite-role">
        <Select name="role" defaultValue="member">
          <SelectTrigger id="invite-role" className="sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">{t("roles.member")}</SelectItem>
            <SelectItem value="admin">{t("roles.admin")}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? t("invite.submitting") : t("invite.submit")}
      </Button>

      {error ? <FormMessage className="w-full">{error}</FormMessage> : null}
    </form>
  );
}
