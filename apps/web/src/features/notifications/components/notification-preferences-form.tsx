"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { Button, FormMessage, toast } from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { updateNotificationPreferencesAction } from "../actions";
import { NOTIFICATION_TYPES, isSuppressibleType, type NotificationType } from "../types";

const initial: FormState = {};

/**
 * In-app notification preferences (spec 23.3). One checkbox per suppressible type
 * governing the IN-APP channel; a non-suppressible type (a §23.3 security notice)
 * renders locked, because it cannot be muted. Absence of a checkbox in the submit
 * is the opt-out — the server reads it as "off". Mirrors `OrgSettingsForm`.
 */
export function NotificationPreferencesForm({
  disabledByType,
}: {
  /** Types the user has turned OFF (in-app), from the stored preferences. */
  disabledByType: Record<string, boolean>;
}) {
  const t = useTranslations("notifications");
  const [state, action, pending] = useActionState(updateNotificationPreferencesAction, initial);

  useEffect(() => {
    if (state.success) toast.success(t("preferences.saved"));
  }, [state, t]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ul className="flex flex-col divide-y">
        {NOTIFICATION_TYPES.map((type) => (
          <PreferenceRow
            key={type}
            type={type}
            label={t(`preferences.types.${type}`)}
            locked={!isSuppressibleType(type)}
            defaultChecked={!disabledByType[type]}
          />
        ))}
      </ul>

      {state.error ? <FormMessage>{t("preferences.error")}</FormMessage> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("preferences.saving") : t("preferences.save")}
        </Button>
      </div>
    </form>
  );
}

function PreferenceRow({
  type,
  label,
  locked,
  defaultChecked,
}: {
  type: NotificationType;
  label: string;
  locked: boolean;
  defaultChecked: boolean;
}) {
  const t = useTranslations("notifications");
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={`inApp-${type}`} className="text-sm">
        {label}
      </label>
      <span className="flex items-center gap-2">
        {locked ? (
          <span className="text-muted-foreground text-xs">{t("preferences.locked")}</span>
        ) : null}
        <input
          id={`inApp-${type}`}
          name={`inApp:${type}`}
          type="checkbox"
          defaultChecked={locked ? true : defaultChecked}
          disabled={locked}
          className="size-4 accent-current"
        />
      </span>
    </li>
  );
}
