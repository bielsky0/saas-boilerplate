"use client";

import { useQuery } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import type { DashboardSummary } from "../types";

/**
 * Personal revenue aggregates (etap 4, faza 3) — `GET /v1/dashboard/summary`.
 * One request for the whole dashboard; errors/loading handled by the view.
 */
export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.orders.summary,
    queryFn: () => browserApi().get<DashboardSummary>("/v1/dashboard/summary"),
  });
}
