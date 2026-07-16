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
import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { listMembers, listPendingInvitations } from "@/features/organizations/data";
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

  const canInvite = hasPermission(role, "members.invite");
  const canUpdateRole = hasPermission(role, "members.update_role");
  const canRemove = hasPermission(role, "members.remove");
  const canRevoke = hasPermission(role, "invitations.revoke");

  const [members, pending] = await Promise.all([
    listMembers(org.id),
    canRevoke ? listPendingInvitations(org.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-muted-foreground text-sm">{org.name}</p>
      </div>

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteMemberForm slug={slug} />
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Team ({members.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              {canUpdateRole || canRemove ? (
                <TableHead className="text-right">Actions</TableHead>
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
                    <Badge variant="outline">{m.role}</Badge>
                    {m.status !== "active" ? <Badge variant="warning">{m.status}</Badge> : null}
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
          <h2 className="text-sm font-medium">Pending invitations ({pending.length})</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="truncate">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{inv.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {inv.expiresAt.toLocaleDateString()}
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
