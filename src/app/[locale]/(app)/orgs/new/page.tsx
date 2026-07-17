import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CreateOrgForm } from "@/features/organizations/components/create-org-form";
import { requireSession } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard.meta"))("newOrg") };
}

/** Create a new organization (spec 3.2). The creator becomes its first Owner. */
export default async function NewOrganizationPage() {
  await requireSession("/orgs/new");
  const t = await getTranslations("dashboard.newOrg");
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("heading")}</h1>
      <p className="text-muted-foreground text-sm">{t("body")}</p>
      <CreateOrgForm />
    </div>
  );
}
