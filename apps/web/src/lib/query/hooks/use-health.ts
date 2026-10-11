"use client";

import { useQuery } from "@tanstack/react-query";

import { browserApi } from "../api-browser";
import { queryKeys } from "../keys";

/**
 * Proof-of-concept TanStack Query (etap 4, faza 1).
 *
 * Jedno zapytanie do żywego Nest (`GET /v1/health`) — udowadnia, że provider
 * jest zamontowany, klient przeglądarkowy dociera do API, a stany
 * loading/error/data renderują się w Client Component. Docelowe hooki
 * (`useOrders`, `useUsers`, …) powstaną w fazach 3–4 na tym samym kształcie.
 */
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => browserApi().get<{ ok: boolean }>("/v1/health"),
  });
}
