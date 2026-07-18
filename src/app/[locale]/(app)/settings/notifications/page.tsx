import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listPreferences } from "@/features/notifications/data";
import { NotificationPreferencesForm } from "@/features/notifications/components/notification-preferences-form";

/**
 * Notification preferences (spec 23.3) — per-user, so guarded by `requireSession`
 * only (not org RBAC). Stored preferences are DEVIATIONS from the default-on, so
 * a type absent from the ledger renders enabled. Governs the in-app channel; the
 * email channel keeps its own opt-out (`features/emails`).
 */
export default async function NotificationSettingsPage() {
  const session = await requireSession("/settings/notifications");
  const prefs = await listPreferences(session.user.id);
  const t = await getTranslations("notifications.preferences");

  // type → true when the user turned the in-app channel OFF.
  const disabledByType: Record<string, boolean> = {};
  for (const p of prefs) {
    if (!p.inAppEnabled) disabledByType[p.type] = true;
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
