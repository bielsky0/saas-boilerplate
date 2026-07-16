import type { Metadata } from "next";

import { CreateOrgForm } from "@/features/organizations/components/create-org-form";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "New organization" };

/** Create a new organization (spec 3.2). The creator becomes its first Owner. */
export default async function NewOrganizationPage() {
  await requireSession("/orgs/new");
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Create an organization</h1>
      <p className="text-muted-foreground text-sm">
        You&apos;ll be added as the owner and can invite teammates next.
      </p>
      <CreateOrgForm />
    </div>
  );
}
