"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsStringEnum, useQueryState } from "nuqs";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import type { TransactionsPage, TransactionStatus } from "../types";

const STATUS_VALUES = ["all", "paid", "failed", "refunded"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

/**
 * Personal transactions (etap 4, faza 3) — `GET /v1/dashboard/transactions`.
 *
 * Filter + page live in the URL (`?status=`, `?page=`) via nuqs, so the table
 * is deep-linkable and survives refresh — same pattern as the settings tabs.
 * Server paginates (`page`/`hasNext`, no totals — COUNT(*) on every render is
 * the query that quietly gets expensive, cf. `Pagination` in `ui/`).
 */
export function useTransactions() {
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
  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(0).withOptions({
      history: "push",
      shallow: true,
      clearOnDefault: true,
    }),
  );

  const query = useQuery({
    queryKey: queryKeys.orders.list({ status, page }),
    queryFn: () =>
      browserApi().get<TransactionsPage>("/v1/dashboard/transactions", {
        query: { status, page },
      }),
  });

  return {
    ...query,
    status: status as StatusFilter,
    setStatus: (next: StatusFilter) => {
      void setStatus(next);
      void setPage(0);
    },
    page,
    setPage,
  };
}

export type { TransactionStatus };
