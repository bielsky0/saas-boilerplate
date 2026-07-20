import { getTranslations } from "next-intl/server";

import { Badge, Button } from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { LeaveOrgButton } from "@/features/organizations/components/org-settings";

/**
 * Academy panel home (spec 3.5, langlion §2.27).
 *
 * NOT a route of its own — `dashboard/page.tsx` renders this when the request
 * addresses an academy host, and the personal account view when it does not.
 * Same path, two meanings, decided by `Host`; the file is split out only because
 * one `page.tsx` holding both would obscure which guard covers which half.
 *
 * Access is enforced by `requireOrgAccess` (403 for non-members, 404 when the
 * host names no academy), not by the caller having checked already.
 */
export default async function AcademyHome() {
  const { org, role } = await requireOrgAccess();
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
          <Link href="/dashboard/members">{t("members")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/files">{t("files")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/settings">{t("settings")}</Link>
        </Button>
        {/* langlion (EPIK 2, 3, 22). Same cosmetic gating as below — each page
            calls requireOrgPermission itself, which is the real boundary. */}
        {hasPermission(role, "group_types.manage") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/group-types">{t("groupTypes")}</Link>
          </Button>
        ) : null}
        {hasPermission(role, "sessions.manage") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/schedule">{t("schedule")}</Link>
          </Button>
        ) : null}
        {hasPermission(role, "credits.manual_grant") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/credits">{t("credits")}</Link>
          </Button>
        ) : null}
        {hasPermission(role, "locations.manage") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/locations">{t("locations")}</Link>
          </Button>
        ) : null}
        {/* Cosmetic gating only (spec 4.2) — the page itself calls
            requireOrgPermission, which is the actual boundary. */}
        {hasPermission(role, "audit.read") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/audit">{t("audit")}</Link>
          </Button>
        ) : null}
        {hasPermission(role, "billing.manage") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/billing">{t("billing")}</Link>
          </Button>
        ) : null}
      </nav>

      <div className="border-border border-t pt-6">
        <LeaveOrgButton />
      </div>
    </div>
  );
}
