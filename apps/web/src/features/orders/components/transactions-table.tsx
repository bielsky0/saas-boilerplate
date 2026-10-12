"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationLink } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTransactions } from "../hooks/use-transactions";
import type { DashboardTransaction } from "../types";

/**
 * Personal transactions table (etap 4, faza 3). Ported from AdminCN's
 * `datatable-transaction`, re-columned for our model:
 *
 * - Customer: session identity (initials avatar, no `/images/avatars/*`);
 * - Amount: `Intl` with the DTO currency (minor → major);
 * - Status: paid/failed/refunded badge (no invented states);
 * - Date instead of "Paid by" (card brands don't exist in our model);
 * - RowActions dropped (Edit/Duplicate/Delete were mock menu items with no
 *   backend — a button that does nothing is worse than no button);
 * - server pagination (`page`/`hasNext` + nuqs) instead of client-side
 *   `getPaginationRowModel` — page numbers need a total, and COUNT(*) on
 *   every render is the query that quietly gets expensive.
 */
type Row = DashboardTransaction & {
  customerName: string;
  customerEmail: string;
  customerInitials: string;
  amountFormatted: string;
  dateFormatted: string;
};

const STATUS_FILTERS = ["all", "paid", "failed", "refunded"] as const;

export function TransactionsTable({
  customerName,
  customerEmail,
}: {
  customerName: string;
  customerEmail: string;
}) {
  const t = useTranslations("dashboard.orders");
  const locale = useLocale();
  const { data, isLoading, isError, status, setStatus, page } = useTransactions();

  // Page moves are plain links (not nuqs writes): deep-link-shaped URLs that
  // Next navigates client-side, with nuqs reading the new params back.
  // Rationale over `setPage`: identical UX, zero writer-state to desync.
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (next !== 0) params.set("page", String(next));
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const statusLabels: Record<DashboardTransaction["status"], string> = {
    paid: t("table.status.paid"),
    failed: t("table.status.failed"),
    refunded: t("table.status.refunded"),
  };
  const filterLabels: Record<string, string> = {
    all: t("table.status.all"),
    ...statusLabels,
  };

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "customer",
      header: t("table.columns.customer"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">{row.original.customerInitials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col text-sm">
            <span className="text-card-foreground font-medium">{row.original.customerName}</span>
            <span className="text-muted-foreground">{row.original.customerEmail}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "amount",
      header: t("table.columns.amount"),
      cell: ({ row }) => <span>{row.original.amountFormatted}</span>,
    },
    {
      accessorKey: "status",
      header: t("table.columns.status"),
      cell: ({ row }) => (
        <Badge className="bg-primary/10 text-primary h-auto rounded-sm px-1.5 capitalize">
          {statusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: "date",
      header: t("table.columns.date"),
      cell: ({ row }) => <span>{row.original.dateFormatted}</span>,
    },
  ];

  const initials = customerName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const rows: Row[] = (data?.rows ?? []).map((row) => ({
    ...row,
    customerName,
    customerEmail,
    customerInitials: initials,
    amountFormatted: new Intl.NumberFormat(locale, {
      style: "currency",
      currency: row.currency,
    }).format(row.amountMinor / 100),
    dateFormatted: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
    }).format(new Date(row.createdAt)),
  }));

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full">
      <div
        className="flex flex-wrap items-center gap-2 px-4 pt-4"
        role="group"
        aria-label={t("table.filterLabel")}
      >
        {STATUS_FILTERS.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "default" : "ghost"}
            onClick={() => setStatus(value)}
          >
            {filterLabels[value]}
          </Button>
        ))}
      </div>
      <div className="border-b">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-muted-foreground h-14 first:pl-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t("table.loading")}
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t("table.error")}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
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
                  {t("table.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col">
        <p className="text-muted-foreground whitespace-nowrap text-sm" aria-live="polite">
          {t("table.page", { page: page + 1 })}
        </p>
        <Pagination>
          <PaginationLink href={pageHref(Math.max(0, page - 1))} disabled={page === 0}>
            <ChevronLeftIcon aria-hidden="true" />
            {t("table.previousLabel")}
          </PaginationLink>
          <PaginationLink href={pageHref(page + 1)} disabled={!data?.hasNext}>
            {t("table.nextLabel")}
            <ChevronRightIcon aria-hidden="true" />
          </PaginationLink>
        </Pagination>
      </div>
    </div>
  );
}
