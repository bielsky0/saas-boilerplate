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
import { invitableRole } from "../schema";
import type { ActionState } from "../actions";

const initialState: ActionState = {};

/**
 * Invite-member form (spec §3.3). Posts the org `slug` so the action resolves the
 * tenant and enforces `members.invite` server-side. Sending is neutral — it never
 * reveals whether the email already has an account. Success is surfaced as a
 * toast; validation errors stay inline next to the form.
 */
export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(inviteMemberAction, initialState);
  const t = useTranslations("organizations");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
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
            {/*
              Driven off the zod enum rather than a hand-written list. The two
              have to agree — an option the action would reject is a form that
              fails after the user commits — and six roles is where "keep them in
              sync by remembering" stops being reliable.
            */}
            {invitableRole.options.map((role) => (
              <SelectItem key={role} value={role}>
                {t(`roles.${role}`)}
              </SelectItem>
            ))}
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
