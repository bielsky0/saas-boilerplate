"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMembers } from "../../hooks/use-members";
import { buildMemberColumns } from "./members-columns";
import { MembersFilters } from "./members-filters";
import { MembersPagination } from "./members-pagination";
import { MembersToolbar } from "./members-toolbar";

const ROLE_VALUES = ["all", "owner", "admin", "member"] as const;
const STATUS_VALUES = ["all", "active", "invited", "suspended"] as const;

/**
 * Org members table (etap 4, faza 4). Chrome ported from AdminCN's users list
 * (filters row, toolbar, sortable table, pagination footer); data is live
 * (`useMembers`) and rows are our member shape.
 *
 * State split is deliberate: filters live in the URL (nuqs shallow pushes —
 * proven safe under the headless-shell one-transition limit), while page,
 * page size and sorting stay local (`useState`, zero navigations).
 */
export function MembersTable({
  slug,
  canUpdateRole,
  canRemove,
}: {
  slug: string;
  canUpdateRole: boolean;
  canRemove: boolean;
}) {
  const t = useTranslations("users");
  const te = useTranslations("organizations");
  const locale = useLocale();
  const { data, isLoading, isError } = useMembers(slug);

  const [role, setRole] = useQueryState(
    "role",
    parseAsStringEnum([...ROLE_VALUES])
      .withDefault("all")
      .withOptions({
        history: "push",
        shallow: true,
        clearOnDefault: true,
      }),
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringEnum([...STATUS_VALUES])
      .withDefault("all")
      .withOptions({
        history: "push",
        shallow: true,
        clearOnDefault: true,
      }),
  );
  const [search, setSearch] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({
      history: "replace",
      shallow: true,
      clearOnDefault: true,
    }),
  );
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);

  const roleLabel = (role: string) =>
    role === "owner" || role === "admin" || role === "member" ? te(`roles.${role}`) : role;
  const statusLabels: Record<string, string> = {
    active: t("status.active"),
    invited: t("status.invited"),
    suspended: t("status.suspended"),
  };
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  const initialsOf = (name: string | null, email: string) =>
    (name ?? email)
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.items ?? []).filter((m) => {
      if (role !== "all" && m.role !== role) return false;
      if (status !== "all" && m.status !== status) return false;
      if (
        query &&
        !m.email.toLowerCase().includes(query) &&
        !(m.name ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [data, role, status, search]);

  const columns = useMemo(
    () =>
      buildMemberColumns({
        tCustomer: t("table.member"),
        tRole: t("table.role"),
        tStatus: t("table.status"),
        tJoined: t("table.joined"),
        tActions: t("table.actions"),
        roleLabel,
        statusLabels,
        formatDate,
        initialsOf,
        slug,
        canUpdateRole,
        canRemove,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, te, locale, slug, canUpdateRole, canRemove],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = table
    .getRowModel()
    .rows.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage);
  const showingFrom = filtered.length === 0 ? 0 : safePage * rowsPerPage + 1;
  const showingTo = Math.min((safePage + 1) * rowsPerPage, filtered.length);

  if (isLoading) {
    return (
      <Card className="py-0 shadow-none" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-64 w-full" />
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert role="alert" variant="warning" data-testid="members-error">
        {t("error")}
      </Alert>
    );
  }

  return (
    <Card className="py-0 shadow-none" data-testid="members-table">
      <div className="w-full">
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-4">
          <MembersFilters
            role={role}
            status={status}
            onRoleChange={(value) => {
              void setRole(value as typeof role);
              setPage(0);
            }}
            onStatusChange={(value) => {
              void setStatus(value as typeof status);
              setPage(0);
            }}
            roleLabel={roleLabel}
            roleAllLabel={t("filters.allRoles")}
            statusAllLabel={t("filters.allStatuses")}
            statusLabel={(value) => statusLabels[value] ?? value}
            roleAriaLabel={t("filters.roleLabel")}
            statusAriaLabel={t("filters.statusLabel")}
          />
        </div>
        <MembersToolbar
          search={search}
          searchLabel={t("toolbar.searchLabel")}
          searchPlaceholder={t("toolbar.searchPlaceholder")}
          rowsPerPage={rowsPerPage}
          rowsPerPageLabel={t("toolbar.rowsPerPageLabel")}
          onSearch={(value) => {
            void setSearch(value);
            setPage(0);
          }}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(value);
            setPage(0);
          }}
        />
        <div className="border-b">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-muted-foreground h-14 first:pl-4"
                      aria-sort={
                        header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className="hover:text-foreground disabled:hover:text-muted-foreground inline-flex items-center gap-1 disabled:cursor-default"
                          disabled={!header.column.getCanSort()}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc"
                            ? " ↑"
                            : header.column.getIsSorted() === "desc"
                              ? " ↓"
                              : null}
                        </button>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {pageRows.length ? (
                pageRows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="first:pl-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <MembersPagination
          showingFrom={showingFrom}
          showingTo={showingTo}
          total={filtered.length}
          canPrevious={safePage > 0}
          canNext={safePage < pageCount - 1}
          onPrevious={() => setPage(safePage - 1)}
          onNext={() => setPage(safePage + 1)}
          previousLabel={t("pagination.previous")}
          nextLabel={t("pagination.next")}
          showing={({ from, to, total }) => t("pagination.showing", { from, to, total })}
        />
      </div>
    </Card>
  );
}
