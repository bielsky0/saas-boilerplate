import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { listMembers, listPendingInvitations } from "@/features/organizations/data";
import { InviteMemberForm } from "@/features/organizations/components/invite-member-form";
import { MemberActions } from "@/features/organizations/components/member-actions";
import { RevokeInviteButton } from "@/features/organizations/components/invitation-actions";

/**
 * Members management (spec 3.4). Lists members with role/remove controls and
 * pending invitations. All buttons are gated cosmetically by `hasPermission`;
 * the actions re-check permissions and the last-owner rule server-side (spec 4.2).
 */
export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{org.name}</p>
      </div>

      {canInvite ? (
        <section className="rounded-md border border-black/10 p-4 dark:border-white/10">
          <h2 className="mb-3 text-sm font-medium">Invite a teammate</h2>
          <InviteMemberForm slug={slug} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Team ({members.length})</h2>
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {members.map((m) => (
            <li key={m.membershipId} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                <p className="truncate text-xs text-black/60 dark:text-white/60">
                  {m.email} · <span className="capitalize">{m.role}</span>
                  {m.status !== "active" ? ` · ${m.status}` : ""}
                </p>
              </div>
              {canUpdateRole || canRemove ? (
                <MemberActions
                  slug={slug}
                  membershipId={m.membershipId}
                  currentRole={m.role}
                  canUpdateRole={canUpdateRole}
                  canRemove={canRemove}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {canRevoke && pending.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Pending invitations ({pending.length})</h2>
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{inv.email}</p>
                  <p className="text-xs text-black/60 dark:text-white/60">
                    <span className="capitalize">{inv.role}</span> · expires{" "}
                    {inv.expiresAt.toLocaleDateString()}
                  </p>
                </div>
                <RevokeInviteButton slug={slug} invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
