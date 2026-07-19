import Link from "next/link";

import {
  Alert,
  Badge,
  Button,
  Input,
  Pagination,
  PaginationLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { requireSuperAdmin } from "@/features/admin/context";
import { listAllOrganizations } from "@/features/admin/data";
import { orgListQuerySchema } from "@/features/admin/schema";
import { TENANCY_MODE, orgsEnabled } from "@/lib/tenancy";

/**
 * All organizations with their metrics (spec 6.2).
 *
 * MRR is absent by design — see the note on `listAllOrganizations`: plans carry no
 * price yet (§5.2), so any MRR figure here would be invented.
 */
export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin("/admin/organizations");

  const query = orgListQuerySchema.parse(await searchParams);
  const { rows, page, hasNext } = await listAllOrganizations(query);

  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (next > 0) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `/admin/organizations?${qs}` : "/admin/organizations";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <p className="text-muted-foreground mt-1 text-sm">Every team account in the system.</p>
      </div>

      {/*
        Read-only by construction (spec §1.4): it renders the mode and offers no
        control, because the mode is an env var read once at startup. That is a
        stronger guarantee than a permission check — there is no in-app switch for
        anyone to find. The panel stays fully functional in all three modes: it is
        a super-admin cross-tenant view, not tenant UI, and it is the one place an
        operator can confirm that org rows survived a switch to `disabled`.
      */}
      <Alert role="status" variant={orgsEnabled ? "info" : "warning"}>
        <span className="font-medium">Tenancy mode: {TENANCY_MODE}</span> — set by{" "}
        <code>MULTI_TENANCY_MODE</code>; changing it requires a redeploy.{" "}
        {orgsEnabled
          ? "Organizations are available to users."
          : "Organizations below are retained and untouched, but hidden from the app UI. Switching back needs no migration."}
      </Alert>

      <form method="GET" action="/admin/organizations" className="flex flex-wrap items-end gap-3">
        <Input
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Name or slug"
          aria-label="Search organizations"
          className="min-w-56 flex-1"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Seats</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                No organizations match this search.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/admin/organizations/${row.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="text-muted-foreground text-xs">/{row.slug}</div>
                </TableCell>
                <TableCell>{row.memberCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">{row.planId ?? "free"}</Badge>
                    {row.subscriptionStatus && row.subscriptionStatus !== "active" ? (
                      <Badge variant="warning">{row.subscriptionStatus}</Badge>
                    ) : null}
                    {row.deletedAt ? <Badge variant="destructive">deleted</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.seats ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  <time dateTime={row.createdAt.toISOString()}>
                    {row.createdAt.toISOString().slice(0, 10)}
                  </time>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Pagination>
        <PaginationLink href={pageHref(page - 1)} disabled={page === 0}>
          Previous
        </PaginationLink>
        <span className="text-muted-foreground text-sm">Page {page + 1}</span>
        <PaginationLink href={pageHref(page + 1)} disabled={!hasNext}>
          Next
        </PaginationLink>
      </Pagination>
    </div>
  );
}
