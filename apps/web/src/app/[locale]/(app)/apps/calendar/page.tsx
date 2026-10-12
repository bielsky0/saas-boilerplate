import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.admin"))("items.calendar") };
}

/**
 * Calendar app shell (etap 5, faza 5.0 — steel thread). Pusta trasa w shellu,
 * żeby faza 5.3 (pełny backend + UI) miała gdzie rosnąć. Treść ląduje tu
 * dopiero z żywymi danymi — żadnych mocków.
 */
export default async function CalendarPage() {
  const t = await getTranslations("nav.admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("items.calendar")}</CardTitle>
        <CardDescription>{t("comingSoon")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{t("comingSoonBody")}</p>
      </CardContent>
    </Card>
  );
}
