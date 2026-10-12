import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CalendarApp } from "@/features/calendar/calendar-app";
import { requireOrgAccess } from "@/features/organizations/context";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("calendar"))("heading") };
}

/**
 * Organization calendar (etap 5, faza 5.3). Membership is the whole boundary
 * (`requireOrgAccess` → 404 unknown slug, 403 non-member); every event read and
 * write is re-scoped to the org server-side. The org's `timezone` — not the
 * viewer's — is the display zone, so the team sees the same grid everywhere.
 */
export default async function OrgCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org } = await requireOrgAccess(slug);
  const t = await getTranslations("calendar");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("orgSubheading", { org: org.name })}</p>
      </div>
      <CalendarApp scope={{ kind: "org", slug: org.slug }} timeZone={org.timezone} />
    </div>
  );
}
