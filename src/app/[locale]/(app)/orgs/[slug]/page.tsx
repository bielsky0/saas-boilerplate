import { getTranslations } from "next-intl/server";

import { Badge, Button } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { LeaveOrgButton } from "@/features/organizations/components/org-settings";

/**
 * Organization overview (spec 3.5). Entry point for an org context; access is
 * enforced by `requireOrgAccess` (403 for non-members, 404 for unknown slugs).
 */
export default async function OrganizationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, role } = await requireOrgAccess(slug);
  const [t, tr] = await Promise.all([
    getTranslations("dashboard.org"),
    getTranslations("organizations.roles"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          {t("yourRole")} <Badge variant="outline">{tr(role)}</Badge>
        </p>
      </div>
      <nav className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/orgs/${slug}/members`}>{t("members")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/orgs/${slug}/files`}>{t("files")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/orgs/${slug}/settings`}>{t("settings")}</Link>
        </Button>
        {/* Cosmetic gating only (spec 4.2) — the page itself calls
            requireOrgPermission, which is the actual boundary. */}
        {hasPermission(role, "audit.read") ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/orgs/${slug}/settings/audit`}>{t("audit")}</Link>
          </Button>
        ) : null}
      </nav>

      <div className="border-border border-t pt-6">
        <LeaveOrgButton slug={slug} />
      </div>
    </div>
  );
}
