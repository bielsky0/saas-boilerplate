"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

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
import { inviteMemberAction } from "../actions";
import type { ActionState } from "../actions";

const initialState: ActionState = {};

/**
 * Invite-member form (spec §3.3). Posts the org `slug` so the action resolves the
 * tenant and enforces `members.invite` server-side. Sending is neutral — it never
 * reveals whether the email already has an account. Success is surfaced as a
 * toast; validation errors stay inline next to the form.
 */
export function InviteMemberForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, initialState);
  const t = useTranslations("organizations");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <input type="hidden" name="slug" value={slug} />
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

      {state.error ? <FormMessage className="w-full">{state.error}</FormMessage> : null}
    </form>
  );
}
