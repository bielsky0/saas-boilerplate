import Link from "next/link";
import { notFound } from "next/navigation";

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
import { requireSuperAdmin } from "@/features/admin/context";
import { getUserDetail, listSolelyOwnedOrgs } from "@/features/admin/data";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { UserActions } from "@/features/admin/components/user-actions";

/**
 * One account: details, memberships, and the privileged actions (spec 6.2).
 *
 * The action buttons here are cosmetic gating only — `UserActions` decides what to
 * SHOW, while every action re-checks `requireSuperAdmin()` and its own invariants
 * server-side (spec 4.2's rule, applied to §6).
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { actorId } = await requireSuperAdmin(`/admin/users/${userId}`);

  const [target, solelyOwnedOrgs] = await Promise.all([
    getUserDetail(userId),
    listSolelyOwnedOrgs(userId),
  ]);
  if (!target) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{target.email}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <StatusBadge status={target.status} />
            {target.isSuperAdmin ? <Badge variant="outline">super admin</Badge> : null}
            {!target.emailVerified ? <Badge variant="outline">unverified</Badge> : null}
          </div>
        </div>
        <UserActions
          userId={target.id}
          email={target.email}
          status={target.status}
          isSuperAdmin={target.isSuperAdmin}
          isSelf={target.id === actorId}
          solelyOwnedOrgs={solelyOwnedOrgs}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-sm">Name</dt>
              <dd>{target.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">Registered</dt>
              <dd>
                <time dateTime={target.createdAt.toISOString()}>
                  {target.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                </time>
              </dd>
            </div>
            {target.banReason ? (
              <div>
                <dt className="text-muted-foreground text-sm">Suspension reason</dt>
                <dd>{target.banReason}</dd>
              </div>
            ) : null}
            {target.deletedAt ? (
              <div>
                <dt className="text-muted-foreground text-sm">Deleted</dt>
                <dd>
                  <time dateTime={target.deletedAt.toISOString()}>
                    {target.deletedAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          {target.orgs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This user does not belong to any organization.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {target.orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {org.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{org.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
