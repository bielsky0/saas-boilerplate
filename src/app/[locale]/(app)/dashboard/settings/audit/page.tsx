import { getLocale, getTranslations } from "next-intl/server";

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
import { withLocale } from "@/lib/i18n/config";
import { AUDIT_ACTIONS, type AuditAction } from "@/features/admin/audit";
import { listOrgAuditEntries, type OrgAuditRow } from "@/features/organizations/audit-data";
import { requireOrgPermission } from "@/features/organizations/context";
import { orgAuditListQuerySchema } from "@/features/organizations/schema";

/**
 * Organization audit trail (spec 6.4) — who changed what in THIS org, newest first.
 *
 * The tenant-facing counterpart to /admin/audit. Two differences from that page,
 * both deliberate:
 *
 *  1. It is TRANSLATED. The admin panel is operator-facing and deliberately
 *     English-only; this is customer-facing, and §6.4's whole point is that an
 *     org's own people can audit their own data.
 *  2. Its form action carries the locale. The admin page posts to a literal
 *     "/admin/audit", which is safe only because (admin) sits outside [locale].
 *     Under [locale] a bare action would drop the prefix on every filter submit
 *     and bounce through a proxy redirect.
 *
 * Access is `requireOrgPermission("audit.read")` as the FIRST line — Owner
 * and Admin only. A Member who types the URL gets a real 403, not a hidden link.
 *
 * Timestamps render in full UTC, never relative: "2 hours ago" is unusable in the
 * incident review and compliance export this page exists for.
 */
export default async function OrgAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org } = await requireOrgPermission("audit.read");

  const query = orgAuditListQuerySchema.parse(await searchParams);
  const [{ rows, page, hasNext }, t, ta, locale] = await Promise.all([
    listOrgAuditEntries(org.id, query),
    getTranslations("dashboard.audit"),
    getTranslations("organizations.auditActions"),
    getLocale(),
  ]);

  const basePath = withLocale(`/dashboard/settings/audit`, locale);

  // `action` is wire vocabulary and the catalog only names the actions that exist
  // today. Narrow before translating; an action written by a NEWER deploy (the
  // column is text, and `listOrgAuditEntries` casts) renders as its raw name
  // rather than throwing a missing-key error and 500ing a compliance view. Same
  // pattern as `roleLabel` in members/page.tsx.
  const actionLabel = (action: string) =>
    (AUDIT_ACTIONS as readonly string[]).includes(action) ? ta(action as AuditAction) : action;

  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (next > 0) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      {/* A plain GET form, no client JS: filters belong in the URL so they can be
          shared and bookmarked, which is most of what a compliance view is for. */}
      <form method="GET" action={basePath} className="flex flex-wrap items-end gap-3">
        <Input
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          className="min-w-56 flex-1"
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("from")}</span>
          <Input name="from" type="date" defaultValue={query.from} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("to")}</span>
          <Input name="to" type="date" defaultValue={query.to} />
        </label>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.when")}</TableHead>
            <TableHead>{t("columns.action")}</TableHead>
            <TableHead>{t("columns.actor")}</TableHead>
            <TableHead>{t("columns.target")}</TableHead>
            <TableHead>{t("columns.details")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                {t("empty")}
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
                    {actionLabel(row.action)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{row.actorEmail}</span>
                  <div className="text-muted-foreground text-xs">
                    {t(`actorTypes.${row.actorType}`)}
                    {typeof row.metadata?.onBehalfOf === "string"
                      ? ` — ${t("onBehalfOf", { email: row.metadata.onBehalfOf })}`
                      : null}
                  </div>
                </TableCell>
                <TableCell>
                  <span>{row.targetLabel}</span>
                  <div className="text-muted-foreground text-xs">{row.targetType}</div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  <AuditDetails metadata={row.metadata} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Pagination>
        <PaginationLink href={pageHref(page - 1)} disabled={page === 0}>
          {t("previous")}
        </PaginationLink>
        <span className="text-muted-foreground text-sm">{t("page", { page: page + 1 })}</span>
        <PaginationLink href={pageHref(page + 1)} disabled={!hasNext}>
          {t("next")}
        </PaginationLink>
      </Pagination>
    </div>
  );
}

/**
 * Render an entry's metadata: §6.4's field-level "old → new" first, then any
 * remaining scalar keys.
 *
 * Field names and values are NOT translated. They are column names and stored
 * data — `role: member → admin` is what the database holds, and an audit view
 * that paraphrases its own evidence is less useful, not more.
 */
function AuditDetails({ metadata }: { metadata: OrgAuditRow["metadata"] }) {
  if (!metadata) return null;

  const { changes } = metadata;
  const changeEntries =
    changes && typeof changes === "object" && !Array.isArray(changes)
      ? Object.entries(changes as Record<string, { from?: unknown; to?: unknown }>)
      : [];

  // `onBehalfOf` is excluded because the Actor column already renders it — showing
  // it twice would read as two different facts.
  const scalars = Object.entries(metadata).filter(
    ([key, value]) => key !== "onBehalfOf" && value !== null && typeof value !== "object",
  );

  if (changeEntries.length === 0 && scalars.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {changeEntries.map(([field, change]) => (
        <div key={field}>
          <span className="font-medium">{field}</span>: {String(change?.from ?? "—")} →{" "}
          {String(change?.to ?? "—")}
        </div>
      ))}
      {scalars.map(([key, value]) => (
        <div key={key}>
          <span className="font-medium">{key}</span>: {String(value)}
        </div>
      ))}
    </div>
  );
}
