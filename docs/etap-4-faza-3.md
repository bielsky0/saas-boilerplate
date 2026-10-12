# Faza 3 — Orders dashboard na żywych danych (plan implementacji)

Status: plan. Wejście: [etap-4-faza-0.md](etap-4-faza-0.md) (inwentaryzacja
widoków), faza 2 DONE (shell + Query + `NuqsAdapter`).

Cel: treść `/dashboard` z danych NestJS, zero `fake-db`/stałych. Po fazie
PoC (`ApiStatus`, `use-health`) znika — zastępuje go widok Orders.

## Decyzja zakresu (do veta, nie do dyskusji w środku fazy)

**Dashboard personalny (revenue dashboard), nie business overview.** Template
rysuje obroty całej firmy; nasz `/dashboard` to kontekst konta osobistego
(spec 3.5), więc agregaty liczymy po `account_id` zalogowanego użytkownika
(`getOrCreatePersonalAccount`, ten sam wzorzec co billing). Nie tworzymy
żadnej nowej domeny ani tabel — dashboard czyta to, co już istnieje:
`billing_payment` (transakcje), `subscription` (plany/statusy), `user`
(dane płatnika = sesja, join zbędny). Widok cross-tenant byłby dziurą
w izolacji (dane cudzych tenantów dla zwykłego usera) — odpada.
Konsekwencja: świeży user widzi stany puste (to body E2E), nie zera
udające biznes. Wetuować można tylko całość, nie połowę.

## Krok 0 — Nest: `apps/api/src/dashboard/` (nowy moduł)

Styl: kopia `admin.service.ts` (zod-schematy przy serwisie, `SessionGuard`
per-handler, envelope `{ error, issues? }`, paginacja `page + hasNext`
jak `listUsers`, nie `totalPages`).

- `GET /v1/dashboard/summary` — jeden request, całe DTO (wszystkie agregaty
  to tanie COUNT/SUM po indeksach `account_idx`):
  - `currency` (dominant — największa suma paid minor), `revenue`
    (total/previous-30d/deltaPct-null-przy-zerowej-bazie), `subscriptions`
    (active/trialing/pastDue/canceled), `payments` (paid/failed/refunded),
    `monthlyRevenue` ×6 mies. (`date_trunc`), `weeklyRevenue` ×12 tyg.,
    `planBreakdown` (planId/count/minor). Serie i total tylko w dominant
    currency (jak admin revenue: nigdy sumować walut bez FX). Puste konto →
    zera/puste tablice, NIE 404.
- `GET /v1/dashboard/transactions?status=paid|failed|refunded&page=` —
  `{ rows: [{ id, amountMinor, currency, status, reason, createdAt }], page,
hasNext }`, newest-first, scope `accountId` z sesji.
- Rejestracja w `app.module.ts`; tag `dashboard` + ścieżki w
  `packages/contracts/openapi.yaml` (kontrakt ręczny — dopisać). Typy DTO
  obok serwisu (jak `AdminUserRow`).

## Krok 1 — Web: dane (`src/features/orders/`)

- `hooks/use-dashboard-summary.ts` — `useQuery(queryKeys.orders.summary)`
  (klucze gotowe z fazy 1). `staleTime` 30s: mount-time transition shella
  (faza 2) nie dobija API przy świeżym cache.
- `hooks/use-transactions.ts` — `useQuery(queryKeys.orders.list({status,page}))`;
  `status`/`page` przez `nuqs` w URL (deep-linkowalna tabela).
- Kwoty: `Intl.NumberFormat` z `currency` z DTO (minor→major /100), locale
  z next-intl. Bez `en-US`-hardcode z template'u.

## Krok 2 — Web: widoki (kopie z `/tmp/admincn-free/src/`, props-izacja)

- `components/ui/chart.tsx` → nowy + eksporty w `ui/index.ts` (recharts 3.10
  vs 3.8 w template — ten sam major; typecheck wykaże).
- `statistics-card-01.tsx` → `features/orders/components/statistics-card.tsx`
  (już propsowy; tylko i18n).
- `chart-sales-metrics.tsx` → `sales-metrics.tsx` (stałe → props z DTO:
  metrics, pie z planBreakdown, bary z weeklyRevenue; "Sandy' Company" znika).
- `widget-product-insights.tsx` → `product-insights.tsx` (serie → props;
  `/images/widgets/image-7.webp` WYRZUCIĆ — zero binariów).
- `widget-total-earning.tsx` → `total-earning.tsx` (już propsowy; wiersze
  per-plan z DTO, awatar z inicjałem zamiast `img`).
- `datatable-transaction.tsx` → `transactions-table.tsx` (kolumny na nasz
  kształt: Klient inicjały z sesji, Kwota Intl, Status badge, **Data zamiast
  "Paid by"** — marek kart nie ma w modelu; `RowActions` odrzucić; paginacja
  serwerowa + nuqs zamiast `getPaginationRowModel`, więc `use-pagination.ts`
  NIE kopiować).
- `orders-view.tsx` (nowy): kompozycja + loading/error/empty (skeletony
  mamy z fazy 2). `dashboard/page.tsx` (RSC) renderuje `<OrdersView/>`.
- TanStack Table 9.2.8 vs 8.21.3 w template: przy głębokich breaking changes
  fallback = downgrade do `8.21.3` (pin jak Base UI), nie port na v9-API.

## Krok 3 — i18n (`dashboard.orders`, EN/PL)

Wszystkie hardcoded stringi (tytuły, "than last week", "No results.",
nagłówki kolumn, mapa znanych `reason` + fallback raw). Daty/liczby przez
`useFormatter`/Intl z locale.

## Krok 4 — Sprzątanie PoC

Usunąć `components/api-status.tsx` i `lib/query/hooks/use-health.ts` (klucz
`health` w `keys.ts` zostaje na fazę 6). `e2e/query-foundation.spec.ts`
ZASTĄPIĆ przez `e2e/orders-dashboard.spec.ts` (wzrorce `interceptHealth` /
`waitForQuiescence` przenieść do `helpers.ts`, gdyby faza 4 ich potrzebowała).

## Krok 5 — E2E: `e2e/orders-dashboard.spec.ts`

Harness gotowy (`billing-fixtures.ts`: `invoiceEvent` z amount/createdAt,
`signedRequest`; `seed-billing-customer` wspiera `userEmail`; webhook
aplikuje synchronicznie):

1. Świeży user → puste stany EN.
2. Seed personal customer + `subscription.created` + 3× `invoice.paid`
   (różne miesiące/kwoty) + 1× `invoice.payment_failed` → figury, wiersze,
   format kwot; suma UI vs `billing-state`.
3. `?status=failed` → tylko failed (nuqs ↔ API passthrough).
4. Paginacja: seed N płatności → `page=2`, znikanie hasNext.
5. PL smoke (labele; waluta z DTO, nie PLN).
6. CSP: zero naruszeń + zero padniętych requestów do API.
7. Multi-currency: USD + EUR (fixture ma `currency: "usd"` na sztywno —
   rozszerzyć o parametr) → dominant currency, brak sumowania walut.

## Krok 6 — Weryfikacja i commit

1. `typecheck + lint + format` (iteracje po v9-API i recharts).
2. Nowy spec + pełna suita.
3. MCP ręcznie: wykresy pod `CSP_MODE=enforce`, dark mode (kolory `oklch`
   - `color-mix` na naszych tokenach), PL/EN, mobile.
4. Commit `feat(web,api): orders dashboard on live data (etap-4 faza 3)`.
