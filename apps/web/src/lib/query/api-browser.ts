import { createApiClient, type ApiClient } from "@repo/api-client";
import { clientEnv } from "../env/client";

/**
 * Przeglądarkowy klient NestJS API (etap 4, faza 1).
 *
 * Różnica względem serwerowego `@/lib/api`: brak `getCookie`. Fetch z
 * przeglądarki niesie cookies sam (`credentials: "include"` jest już
 * w `@repo/api-client`), więc sesja Better Auth dociera do Nest bez
 * przepisywania nagłówków. Używać TYLKO w Client Components (i hookach Query).
 */
export function browserApi(): ApiClient {
  return createApiClient({ baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL });
}
