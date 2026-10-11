"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/ui";
import { useHealth } from "@/lib/query/hooks/use-health";

/**
 * Proof-of-concept TanStack Query (etap 4, faza 1 — do zastąpienia przez
 * `features/orders` w fazie 3).
 *
 * Jeden żywy odczyt z Nest (`GET /v1/health`) renderowany w Client Component:
 * dowodzi, że `QueryProvider` jest zamontowany, klient przeglądarkowy dociera
 * do API z sesją cookie, a stany loading/error/data działają. `data-testid`
 * celowo stabilne — asertuje je `e2e/query-foundation.spec.ts`.
 */
export function ApiStatus() {
  const t = useTranslations("dashboard.apiStatus");
  const { data, isLoading, isError } = useHealth();

  return (
    <section aria-label={t("title")} data-testid="api-status">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {isLoading ? <p data-testid="api-status-loading">{t("loading")}</p> : null}
      {isError ? (
        <Alert role="alert" variant="warning" data-testid="api-status-error">
          {t("error")}
        </Alert>
      ) : null}
      {data?.ok ? <p data-testid="api-status-ok">{t("ok")}</p> : null}
    </section>
  );
}
