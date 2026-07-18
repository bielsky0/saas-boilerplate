import {
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
import { listAuditEntries } from "@/features/admin/data";
import { auditListQuerySchema } from "@/features/admin/schema";

/**
 * Audit log (spec 6.3) — every critical admin action, newest first.
 *
 * Timestamps render in full (not relative): "2 hours ago" is unusable in an
 * incident review, which is the only reason this page exists.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin("/admin/audit");

  const query = auditListQuerySchema.parse(await searchParams);
  const { rows, page, hasNext } = await listAuditEntries(query);

  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (next > 0) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Critical admin actions, with who performed them and when.
        </p>
      </div>

      <form method="GET" action="/admin/audit" className="flex flex-wrap items-end gap-3">
        <Input
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Actor, target or action"
          aria-label="Search audit log"
          className="min-w-56 flex-1"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                No audit entries match this search.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  <time dateTime={row.createdAt.toISOString()}>
                    {row.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                  </time>
                </TableCell>
                <TableCell>
                  <Badge variant={row.action.startsWith("impersonation") ? "warning" : "outline"}>
                    {row.action}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{row.actorEmail}</span>
                  <div className="text-muted-foreground text-xs">{row.actorType}</div>
                </TableCell>
                <TableCell>
                  <span>{row.targetLabel}</span>
                  <div className="text-muted-foreground text-xs">{row.targetType}</div>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs text-xs">
                  {/* Raw JSON, unlike the org page's formatted view. This is an
                      operator tool: an incident review wants every key that is
                      actually there, including ones no renderer knows about yet. */}
                  {row.metadata ? (
                    <span className="break-words">{JSON.stringify(row.metadata)}</span>
                  ) : null}
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
