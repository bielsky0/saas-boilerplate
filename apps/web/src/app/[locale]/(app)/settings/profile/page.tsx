import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProfileForm } from "@/features/profile/components/profile-form";
import { requireSession } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("profile"))("heading") };
}

/**
 * Own profile settings (etap 4, faza 4). Guard here (RSC); the form is a
 * Client Component over TanStack Query (`PATCH /v1/profile`).
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
      <ProfileForm />
    </div>
  );
}
