import Link from "next/link";

import { requireOrgAccess } from "@/features/organizations/context";
import { LeaveOrgButton } from "@/features/organizations/components/org-settings";

/**
 * Organization overview (spec 3.5). Entry point for an org context; access is
 * enforced by `requireOrgAccess` (403 for non-members, 404 for unknown slugs).
 */
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, role } = await requireOrgAccess(slug);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Your role: <span className="font-medium capitalize">{role}</span>
        </p>
      </div>
      <nav className="flex gap-4 text-sm">
        <Link href={`/orgs/${slug}/members`} className="underline">
          Members
        </Link>
        <Link href={`/orgs/${slug}/settings`} className="underline">
          Settings
        </Link>
      </nav>

      <div className="border-t border-black/10 pt-6 dark:border-white/10">
        <LeaveOrgButton slug={slug} />
      </div>
    </div>
  );
}
