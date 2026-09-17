import Link from "next/link";
import { forbidden } from "next/navigation";

import { ApiError } from "@repo/api-client";
import type { AdminUsersResponse } from "@repo/contracts/admin";
import {
  Badge,
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
import { StatusBadge } from "@/features/admin/components/status-badge";
import { UserFilters } from "@/features/admin/components/user-filters";
import { userListQuerySchema } from "@/features/admin/schema";
import { api } from "@/lib/api";

/**
 * All users, searchable (spec 6.2) — read from Nest (faza 2.6), never the
 * database. `requireSuperAdmin()` is still the first line: it is the
 * render-side guard, while the API re-checks behind `SuperAdminGuard`
 * (spec 4.2's rule, applied to §6).
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin("/admin/users");

  const query = userListQuerySchema.parse(await searchParams);

  const params: Record<string, string> = {};
  if (query.q) params["q"] = query.q;
  if (query.status !== "all") params["status"] = query.status;
  if (query.from) params["from"] = query.from;
  if (query.to) params["to"] = query.to;
  params["page"] = String(query.page);

  let body: AdminUsersResponse;
  try {
    body = await api().get<AdminUsersResponse>("/v1/admin/users", { query: params });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) forbidden();
    throw error;
  }
  const rows = body.rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
  const { page, hasNext } = body;

  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status !== "all") params.set("status", query.status);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (next > 0) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground mt-1 text-sm">Every account in the system.</p>
      </div>

      <UserFilters query={query} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Registered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                No users match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/admin/users/${row.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.email}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.name || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={row.status} />
                    {row.isSuperAdmin ? <Badge variant="outline">super admin</Badge> : null}
                    {!row.emailVerified ? <Badge variant="outline">unverified</Badge> : null}
                  </div>
                </TableCell>
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
