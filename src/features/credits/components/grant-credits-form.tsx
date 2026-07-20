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
  Textarea,
  toast,
} from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { grantCreditsAction } from "../actions";

const initial: FormState = {};

/**
 * Manual credit grant (langlion §2.4, US-7.3).
 *
 * THE REASON FIELD CARRIES NO `required` ATTRIBUTE, and that is a choice rather
 * than an omission. US-7.3/AC1 is about the SERVER refusing an unexplained grant,
 * because a request that never came through this form must be refused too. A
 * browser-side `required` would hide that refusal behind a validation bubble and
 * leave the rule that actually matters untested — the schema behind the action is
 * the boundary, exactly as `requireOrgPermission` is for the permission (§4.2).
 * The `hint` below tells the admin the field is needed; the server enforces it.
 *
 * The athlete picker defaults to the FAMILY WALLET (US-7.4/AC1). A goodwill
 * gesture to a family should be spendable by whichever child ends up attending;
 * reserving it to one of them is the narrower outcome, so it is the one that has
 * to be chosen explicitly.
 *
 * The athlete list is not filtered by the selected parent, and the action rejects
 * a mismatch rather than the form preventing it. Deliberate for this phase: the
 * grant surface is an admin tool over a handful of rows, and the check has to
 * exist server-side regardless (a credit reserved for another family's child is
 * one nobody can ever spend). Filtering client-side would add state that only
 * duplicates a rule already enforced where it counts.
 */
export function GrantCreditsForm({
  slug,
  clients,
  creditTypes,
  athletes,
}: {
  slug: string;
  clients: { id: string; email: string; isVerified: boolean }[];
  creditTypes: { id: string; name: string }[];
  athletes: { id: string; name: string; parentClientId: string }[];
}) {
  const t = useTranslations("credits");
  const [state, action, pending] = useActionState(grantCreditsAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("form.client")} htmlFor="grant-client">
          <Select name="clientId">
            <SelectTrigger id="grant-client" aria-label={t("form.client")}>
              <SelectValue placeholder={t("form.choose")} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.isVerified ? row.email : `${row.email} ${t("form.unverified")}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t("form.creditType")} htmlFor="grant-credit-type">
          <Select name="creditTypeId">
            <SelectTrigger id="grant-credit-type" aria-label={t("form.creditType")}>
              <SelectValue placeholder={t("form.choose")} />
            </SelectTrigger>
            <SelectContent>
              {creditTypes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t("form.athlete")} htmlFor="grant-athlete" hint={t("form.athleteHint")}>
          <Select name="athleteId" defaultValue="">
            <SelectTrigger id="grant-athlete" aria-label={t("form.athlete")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("form.familyWallet")}</SelectItem>
              {athletes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t("form.quantity")} htmlFor="grant-quantity">
          <Input
            id="grant-quantity"
            name="quantity"
            type="number"
            min={1}
            max={100}
            defaultValue={1}
            required
          />
        </FormField>
      </div>

      <FormField label={t("form.reason")} htmlFor="grant-reason" hint={t("form.reasonHint")}>
        <Textarea id="grant-reason" name="reason" rows={2} />
      </FormField>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("form.submitting") : t("form.submit")}
        </Button>
      </div>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
