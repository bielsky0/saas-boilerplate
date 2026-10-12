import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { MembersView } from "@/features/organizations/components/members-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard.members"))("heading") };
}

/**
 * Members management (spec §3.4). Guard + permission gating resolve here
 * (RSC); the table itself is a Client Component over TanStack Query so
 * writes (invite/role/remove/revoke) invalidate instead of refreshing.
 */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, role } = await requireOrgAccess(slug);

  return (
    <MembersView
      slug={slug}
      orgName={org.name}
      canInvite={hasPermission(role, "members.invite")}
      canUpdateRole={hasPermission(role, "members.update_role")}
      canRemove={hasPermission(role, "members.remove")}
      canRevoke={hasPermission(role, "invitations.revoke")}
    />
  );
}
