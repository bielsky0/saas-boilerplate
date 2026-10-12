"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { Column, ColumnDef, SortingState } from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  ArrowLeftFromLineIcon,
  ArrowRightFromLineIcon,
  EllipsisIcon,
  PinOffIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type Product = {
  productId: number;
  productName: string;
  category: string;
  stockQuantity: number;
  price: number;
  supplier: string;
  discontinued: "no" | "yes";
};

const getPinningStyles = (column: Column<Product>): CSSProperties => {
  const isPinned = column.getIsPinned();

  return {
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    zIndex: isPinned ? 1 : 0,
  };
};

/**
 * Pinnable-columns data table demo (etap 5, faza 5.1). Sticky left/right
 * pinning over hardcoded demo rows (see `DemoBanner`). Headers translated;
 * product names stay sample data.
 */
const DataTablePinnableColumns = ({ data }: { data: Product[] }) => {
  const t = useTranslations("demo");
  const locale = useLocale();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<Product>[] = [
    {
      header: t("datatable.pinnable.productName"),
      accessorKey: "productName",
      cell: ({ row }) => <div className="font-medium">{row.getValue("productName")}</div>,
    },
    {
      header: t("datatable.pinnable.category"),
      accessorKey: "category",
      cell: ({ row }) => <div>{row.getValue("category")}</div>,
    },
    {
      header: t("datatable.pinnable.stock"),
      accessorKey: "stockQuantity",
      cell: ({ row }) => <div>{row.getValue("stockQuantity")}</div>,
    },
    {
      header: t("datatable.pinnable.price"),
      accessorKey: "price",
      cell: ({ row }) => {
        const price = parseFloat(row.getValue("price"));

        const formatted = new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "USD",
        }).format(price);

        return <div>{formatted}</div>;
      },
    },
    {
      header: t("datatable.pinnable.supplier"),
      accessorKey: "supplier",
      cell: ({ row }) => <div>{row.getValue("supplier")}</div>,
    },
    {
      header: t("datatable.pinnable.discontinued"),
      accessorKey: "discontinued",
      cell: ({ row }) => <div className="capitalize">{row.getValue("discontinued")}</div>,
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    enableSortingRemoval: false,
  });

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-md">
        <Table className="[&_td]:border-border [&_th]:border-border border-separate border-spacing-0 [&_tfoot_td]:border-t [&_th]:border-b [&_tr:not(:last-child)_td]:border-b [&_tr]:border-none">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const { column } = header;
                  const isPinned = column.getIsPinned();
                  const isLastLeftPinned = isPinned === "left" && column.getIsLastColumn("left");
                  const isFirstRightPinned =
                    isPinned === "right" && column.getIsFirstColumn("right");

                  return (
                    <TableHead
                      key={header.id}
                      className="data-pinned:bg-muted/90 data-pinned:backdrop-blur-xs relative h-10 truncate"
                      colSpan={header.colSpan}
                      style={{ ...getPinningStyles(column) }}
                      data-pinned={isPinned || undefined}
                      data-last-col={
                        isLastLeftPinned ? "left" : isFirstRightPinned ? "right" : undefined
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </span>

                        {!header.isPlaceholder &&
                          header.column.getCanPin() &&
                          (header.column.getIsPinned() ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="-mr-1 size-7"
                              onClick={() => header.column.pin(false)}
                              aria-label={t("datatable.pinnable.unpin", {
                                column:
                                  typeof header.column.columnDef.header === "string"
                                    ? header.column.columnDef.header
                                    : header.id,
                              })}
                              title={t("datatable.pinnable.unpin", {
                                column:
                                  typeof header.column.columnDef.header === "string"
                                    ? header.column.columnDef.header
                                    : header.id,
                              })}
                            >
                              <PinOffIcon className="opacity-60" aria-hidden="true" />
                            </Button>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="-mr-1 size-7"
                                    aria-label={t("datatable.pinnable.pinOptions", {
                                      column:
                                        typeof header.column.columnDef.header === "string"
                                          ? header.column.columnDef.header
                                          : header.id,
                                    })}
                                    title={t("datatable.pinnable.pinOptions", {
                                      column:
                                        typeof header.column.columnDef.header === "string"
                                          ? header.column.columnDef.header
                                          : header.id,
                                    })}
                                  >
                                    <EllipsisIcon className="opacity-60" aria-hidden="true" />
                                  </Button>
                                }
                              />
                              <DropdownMenuContent align="end" className="w-35">
                                <DropdownMenuItem onClick={() => header.column.pin("left")}>
                                  <ArrowLeftFromLineIcon
                                    size={16}
                                    className="opacity-60"
                                    aria-hidden="true"
                                  />
                                  {t("datatable.pinnable.pinLeft")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => header.column.pin("right")}>
                                  <ArrowRightFromLineIcon
                                    size={16}
                                    className="opacity-60"
                                    aria-hidden="true"
                                  />
                                  {t("datatable.pinnable.pinRight")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ))}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => {
                    const { column } = cell;
                    const isPinned = column.getIsPinned();
                    const isLastLeftPinned = isPinned === "left" && column.getIsLastColumn("left");
                    const isFirstRightPinned =
                      isPinned === "right" && column.getIsFirstColumn("right");

                    return (
                      <TableCell
                        key={cell.id}
                        className="data-pinned:bg-background/90 data-pinned:backdrop-blur-xs truncate"
                        style={{ ...getPinningStyles(column) }}
                        data-pinned={isPinned || undefined}
                        data-last-col={
                          isLastLeftPinned ? "left" : isFirstRightPinned ? "right" : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t("datatable.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DataTablePinnableColumns;
