import { getTranslations } from "next-intl/server";

import { ApiError } from "@repo/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { NotificationPreferencesForm } from "@/features/notifications/components/notification-preferences-form";

/**
 * Notification preferences (spec 23.3) — per-user, so guarded by `requireSession`
 * only (not org RBAC). Stored preferences are DEVIATIONS from the default-on, so
 * a type absent from the ledger renders enabled. Governs the in-app channel; the
 * email channel keeps its own opt-out (`features/emails`).
 *
 * Reads from Nest (`GET /v1/notifications/preferences`, faza 2.3) — the page
 * renders, it never touches the database.
 */
export default async function NotificationSettingsPage() {
  await requireSession("/settings/notifications");
  const t = await getTranslations("notifications.preferences");

  let stored: Record<string, boolean> = {};
  try {
    const data = await api().get<{ preferences: Record<string, boolean> }>(
      "/v1/notifications/preferences",
    );
    stored = data.preferences;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // Unauthenticated reads as all-defaults rather than failing the page —
    // the guard above already redirected anonymous visitors.
  }

  // type → true when the user turned the in-app channel OFF.
  const disabledByType: Record<string, boolean> = {};
  for (const [type, enabled] of Object.entries(stored)) {
    if (!enabled) disabledByType[type] = true;
  }

  return (
    <div className="flex max-w-md flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subheading")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("inAppTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm disabledByType={disabledByType} />
        </CardContent>
      </Card>
    </div>
  );
}
