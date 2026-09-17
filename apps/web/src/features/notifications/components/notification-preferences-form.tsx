"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Button, FormMessage, toast } from "@/components/ui";
import { clientEnv } from "@/lib/env/client";
import { NOTIFICATION_TYPES, isSuppressibleType, type NotificationType } from "../types";

/**
 * In-app notification preferences (spec 23.3) — saves straight to Nest
 * (`PUT /v1/notifications/preferences`, faza 2.3). One checkbox per
 * suppressible type governing the IN-APP channel; a non-suppressible type
 * (a §23.3 security notice) renders locked, because it cannot be muted.
 * Unchecked at submit is the opt-out. Mirrors `OrgSettingsForm`.
 */
export function NotificationPreferencesForm({
  disabledByType,
}: {
  /** Types the user has turned OFF (in-app), from the stored preferences. */
  disabledByType: Record<string, boolean>;
}) {
  const t = useTranslations("notifications");
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const data = new FormData(event.currentTarget);
      const preferences: Record<string, boolean> = {};
      for (const type of NOTIFICATION_TYPES) {
        if (!isSuppressibleType(type)) continue;
        preferences[type] = data.get(`inApp:${type}`) === "on";
      }
      const res = await fetch(
        `${clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "")}/v1/notifications/preferences`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ preferences }),
        },
      );
      if (!res.ok) {
        setError(t("preferences.error"));
        return;
      }
      toast.success(t("preferences.saved"));
    } catch {
      setError(t("preferences.error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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

      {error ? <FormMessage>{error}</FormMessage> : null}

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
