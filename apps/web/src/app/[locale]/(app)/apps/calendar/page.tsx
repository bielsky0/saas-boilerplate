import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalendarApp } from "@/features/calendar/calendar-app";
import { requireSession } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.admin"))("items.calendar") };
}

/**
 * Personal calendar (etap 5, faza 5.3). RSC guard + title; the grid itself is a
 * Client Component over TanStack Query. Scope is the caller's personal account
 * and the display zone is the browser's — an org calendar lives under
 * `/orgs/[slug]/calendar`, where the org's own `timezone` applies.
 */
export default async function CalendarPage() {
  await requireSession("/apps/calendar");
  const t = await getTranslations("calendar");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subheading")}</p>
      </div>
      <CalendarApp scope={{ kind: "personal" }} />
    </div>
  );
}
