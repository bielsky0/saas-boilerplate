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
import { getOrganizationDetail } from "@/features/admin/data";
import { OrgActions } from "@/features/admin/components/org-actions";

/**
 * One organization: metrics, members, revenue, and deletion (spec 6.2).
 */
export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireSuperAdmin(`/admin/organizations/${orgId}`);

  const org = await getOrganizationDetail(orgId);
  if (!org) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground text-sm">/{org.slug}</span>
            <Badge variant="outline">{org.planId ?? "free"}</Badge>
            {org.deletedAt ? <Badge variant="destructive">deleted</Badge> : null}
          </div>
        </div>
        <OrgActions
          organizationId={org.id}
          name={org.name}
          memberCount={org.memberCount}
          deleted={org.deletedAt !== null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-sm">Active members</dt>
              <dd>{org.memberCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">Subscription</dt>
              <dd>
                {org.subscriptionStatus ?? "none"}
                {org.seats ? ` · ${org.seats} seat${org.seats === 1 ? "" : "s"}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">Created</dt>
              <dd>
                <time dateTime={org.createdAt.toISOString()}>
                  {org.createdAt.toISOString().slice(0, 10)}
                </time>
              </dd>
            </div>
            <div>
              {/* Revenue to date, not MRR — see the note on listAllOrganizations. */}
              <dt className="text-muted-foreground text-sm">Net revenue to date</dt>
              <dd>
                {org.revenue.length === 0
                  ? "—"
                  : org.revenue.map((entry) => (
                      <div key={entry.currency}>
                        {(entry.netMinor / 100).toFixed(2)} {entry.currency.toUpperCase()}
                      </div>
                    ))}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {org.members.length === 0 ? (
            <p className="text-muted-foreground text-sm">This organization has no members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <Link
                        href={`/admin/users/${member.userId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {member.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{member.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.status}</TableCell>
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
