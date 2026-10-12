/**
 * Fabryka kluczy TanStack Query (etap 4, faza 1).
 *
 * Jeden moduł na wszystkie klucze, żeby invalidacja po mutacji trafiała
 * w te same tablice co zapytania (`queryClient.invalidateQueries({ queryKey:
 * queryKeys.users.all })` unieważnia listę i detale naraz). Parametry filtrów
 * wchodzą w klucz, więc każda kombinacja filtrów ma własny wpis w cache.
 */

export const queryKeys = {
  session: ["session"],
  orders: {
    all: ["orders"],
    list: (filters: Record<string, string | number | boolean | undefined>) => [
      "orders",
      "list",
      filters,
    ],
    summary: ["orders", "summary"],
  },
  users: {
    all: ["users"],
    list: (params: Record<string, string | number | boolean | undefined>) => [
      "users",
      "list",
      params,
    ],
    detail: (id: string) => ["users", "detail", id],
  },
  profile: ["profile"],
  calendar: {
    all: ["calendar"],
  },
  connections: {
    all: ["connections"],
  },
} as const;
