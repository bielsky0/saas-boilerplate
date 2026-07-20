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
import { createGroupTypeAction, updateGroupTypeAction } from "../actions";
import { billingType, engine, paymentPolicy, purchaseMode } from "../schema";

const initial: FormState = {};

export type GroupTypeDefaults = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  engine: string;
  paymentPolicy: string;
  price: number;
  isNewClientOnly: boolean;
  defaultLocationId: string | null;
  allowedPurchaseModes: string[];
  allowedBillingTypes: string[] | null;
};

/**
 * Group type form (langlion EPIK 2, EPIK 23) — one component, two modes.
 *
 * Create and edit post the same field set to two actions that validate with the
 * SAME zod schema, so the two can never drift on which fields are required. The
 * only structural difference is the hidden `groupTypeId` the edit mode carries.
 *
 * Every closed vocabulary here is rendered off the zod enum rather than a
 * hand-written list, for the reason spelled out in `invite-member-form.tsx`: an
 * option the action would reject is a form that fails after the user commits.
 *
 * NOTE `name="groupSlug"` for the offer's own slug. The form also posts the
 * ORGANIZATION's slug as `name="slug"`, which is what the action reads to resolve
 * the tenant — two different slugs at two different scopes (§2.27), and colliding
 * them in one FormData key would silently route the edit at the wrong entity.
 */
export function GroupTypeForm({
  slug,
  locations,
  defaults,
}: {
  slug: string;
  locations: { id: string; name: string }[];
  defaults?: GroupTypeDefaults;
}) {
  const t = useTranslations("groups");
  const isEdit = Boolean(defaults);
  const [state, action, pending] = useActionState(
    isEdit ? updateGroupTypeAction : createGroupTypeAction,
    initial,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      {defaults ? <input type="hidden" name="groupTypeId" value={defaults.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("form.name")} htmlFor="gt-name">
          <Input id="gt-name" name="name" defaultValue={defaults?.name} required />
        </FormField>
        <FormField label={t("form.slug")} htmlFor="gt-slug" hint={t("form.slugHint")}>
          <Input id="gt-slug" name="groupSlug" defaultValue={defaults?.slug} required />
        </FormField>
      </div>

      <FormField
        label={t("form.description")}
        htmlFor="gt-description"
        hint={t("form.descriptionHint")}
      >
        <Textarea
          id="gt-description"
          name="description"
          defaultValue={defaults?.description ?? ""}
          rows={4}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("form.engine")} htmlFor="gt-engine">
          <Select name="engine" defaultValue={defaults?.engine ?? "schedule_first"}>
            <SelectTrigger id="gt-engine" aria-label={t("form.engine")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {engine.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`engine.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t("form.paymentPolicy")} htmlFor="gt-payment">
          <Select name="paymentPolicy" defaultValue={defaults?.paymentPolicy ?? "on_site"}>
            <SelectTrigger id="gt-payment" aria-label={t("form.paymentPolicy")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentPolicy.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`paymentPolicy.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/*
          Minor units, entered as an integer (§2.14). No decimal input and no
          conversion layer: the number typed here is the number stored and the
          number Stripe is eventually handed, which is precisely what removes the
          rounding class of bug.
        */}
        <FormField label={t("form.price")} htmlFor="gt-price" hint={t("form.priceHint")}>
          <Input
            id="gt-price"
            name="price"
            type="number"
            min={0}
            step={1}
            defaultValue={defaults?.price ?? 0}
            required
          />
        </FormField>
      </div>

      <FormField label={t("form.defaultLocation")} htmlFor="gt-location">
        <Select name="defaultLocationId" defaultValue={defaults?.defaultLocationId ?? ""}>
          <SelectTrigger id="gt-location" aria-label={t("form.defaultLocation")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("form.noLocation")}</SelectItem>
            {locations.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("form.allowedPurchaseModes")}</legend>
        <div className="flex flex-wrap gap-4">
          {purchaseMode.options.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allowedPurchaseModes"
                value={value}
                defaultChecked={
                  defaults?.allowedPurchaseModes.includes(value) ?? value === "single_class"
                }
                className="accent-primary size-4"
              />
              {t(`purchaseMode.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("form.allowedBillingTypes")}</legend>
        <div className="flex flex-wrap gap-4">
          {billingType.options.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allowedBillingTypes"
                value={value}
                defaultChecked={defaults?.allowedBillingTypes?.includes(value) ?? false}
                className="accent-primary size-4"
              />
              {t(`billingType.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isNewClientOnly"
          defaultChecked={defaults?.isNewClientOnly ?? false}
          className="accent-primary size-4"
        />
        {t("form.isNewClientOnly")}
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {isEdit
            ? pending
              ? t("form.saving")
              : t("form.save")
            : pending
              ? t("form.submitting")
              : t("form.submit")}
        </Button>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      </div>
    </form>
  );
}
