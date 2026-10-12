import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProfileTabs } from "@/features/profile/components/profile-tabs";
import { requireSession } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("profile"))("heading") };
}

/**
 * Own profile settings (etap 5, faza 5.2 — tabs over the faza-4 form).
 * Guard here (RSC); view card + name form + connections are Client
 * Components over TanStack Query.
 */
export default async function ProfileSettingsPage() {
  await requireSession("/settings/profile");

  const t = await getTranslations("profile");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subheading")}</p>
      </div>
      <ProfileTabs />
    </div>
  );
}
