import { getLocale, getTranslations } from "next-intl/server";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { formatContentDate } from "@/features/content/format";
import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { listMembers, listPendingInvitations } from "@/features/organizations/data";
import { withTenant } from "@/lib/db/tenant";
import { InviteMemberForm } from "@/features/organizations/components/invite-member-form";
import { MemberActions } from "@/features/organizations/components/member-actions";
import { RevokeInviteButton } from "@/features/organizations/components/invitation-actions";

/**
 * Members management (spec §3.4). Lists members with role/remove controls and
 * pending invitations. All buttons are gated cosmetically by `hasPermission`;
 * the actions re-check permissions and the last-owner rule server-side (spec §4.2).
 */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, role } = await requireOrgAccess(slug);
  const [t, tr, locale] = await Promise.all([
    getTranslations("dashboard.members"),
    getTranslations("organizations.roles"),
    getLocale(),
  ]);

  // `role` is typed `string` (it comes straight from the column), but the catalog
  // only names the three known roles. Narrow before translating; anything else
  // renders as-is rather than throwing on a missing key.
  const roleLabel = (role: string) =>
    role === "owner" || role === "admin" || role === "member" ? tr(role) : role;

  const canInvite = hasPermission(role, "members.invite");
  const canUpdateRole = hasPermission(role, "members.update_role");
  const canRemove = hasPermission(role, "members.remove");
  const canRevoke = hasPermission(role, "invitations.revoke");

  // One transaction, not `Promise.all`: both tables are under RLS, so each query
  // needs the tenant GUC, and two `withTenant` calls would take two connections
  // from the pool to render one page. Sequential inside one transaction is two
  // round-trips on one connection.
  const { members, pending } = await withTenant(org.id, async (tx) => ({
    members: await listMembers(tx, org.id),
    pending: canRevoke ? await listPendingInvitations(tx, org.id) : [],
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{org.name}</p>
      </div>

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("inviteTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteMemberForm slug={slug} />
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t("team", { count: members.length })}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colMember")}</TableHead>
              <TableHead>{t("colRole")}</TableHead>
              {canUpdateRole || canRemove ? (
                <TableHead className="text-right">{t("colActions")}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.membershipId}>
                <TableCell className="min-w-0">
                  <p className="truncate font-medium">{m.name || m.email}</p>
                  <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">{roleLabel(m.role)}</Badge>
                    {m.status !== "active" ? (
                      <Badge variant="warning">
                        {m.status === "suspended" ? t("statusSuspended") : t("statusInvited")}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                {canUpdateRole || canRemove ? (
                  <TableCell className="text-right">
                    <MemberActions
                      slug={slug}
                      membershipId={m.membershipId}
                      currentRole={m.role}
                      canUpdateRole={canUpdateRole}
                      canRemove={canRemove}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {canRevoke && pending.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("pending", { count: pending.length })}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead>{t("colExpires")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="truncate">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(inv.role)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatContentDate(inv.expiresAt.toISOString().slice(0, 10), locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RevokeInviteButton slug={slug} invitationId={inv.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
