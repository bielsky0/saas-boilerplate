import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient factory (etap 4, faza 1 — Next jako frontend do NestJS).
 *
 * Browser: JEDEN współdzielony instance (singleton). Tworzenie nowego klienta
 * na każdy render kasowałoby cache i dublowało fetche (w React 19 StrictMode
 * widać to natychmiast jako podwójne zapytania).
 *
 * Server: ZAWSZE świeża instancja na wywołanie. Jeden globalny klient na
 * serwerze przeciekałby dane między requestami różnych użytkowników.
 * W tej fazie serwer klienta nie używa (Query tylko w Client Components) —
 * gałąź serwerowa to przyszłościowy guard, nie martwy kod.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Dane z Nest są świeże przez ~30s; krócej nie ma sensu (ovir pw),
        // dłużej kłamałoby przy mutacjach z innych kart.
        staleTime: 30_000,
        // Jeden retry dla GET — ale NIGDY dla 401/403. Niezalogowany użytkownik
        // ma dostać stan error od razu, nie po dwóch rundach opóźnień.
        retry: (failureCount, error) => {
          if (error instanceof Error && "status" in error) {
            const status = (error as { status: number }).status;
            if (status === 401 || status === 403) return false;
          }
          return failureCount < 1;
        },
        // Dashboard z wykresami nie ma migotać przy przełączaniu kart.
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
