# Etap 4 — AdminCN Free + TanStack Query (Next jako frontend do NestJS)

Status: plan (po etapie 3: web jako czysty frontend, Nest jako główne API).

Powiązane: [ARCHITECTURE.md](ARCHITECTURE.md) (layout, kontrakt cookie §6),
[backend-contract.md](backend-contract.md) (kontrakt framework-free),
[specyfikacja.md](specyfikacja.md) (wymagania produktowe),
[etap-3.md](etap-3.md) (poprzedni etap — rozdział frontend/backend),
[etap-4-faza-0.md](etap-4-faza-0.md) (wynik inwentaryzacji template'u),
template: `shadcnstudio/shadcn-nextjs-admincn-admin-template-free` (MIT,
wymagana atrybucja linkiem do `https://shadcnstudio.com/` w stopce).

## Decyzje użytkownika (nie do renegocjowania w środku faz)

1. **Zakres:** shell (sidebar/header/themeConfig) + Orders dashboard + Users
   list/view + podstrony typu User Settings / User Profile + reskin stron auth
   (login/register/forgot/reset) na UI z template'u. Mail/Calendar z template'u
   świadomie poza zakresem — ewentualny follow-up po tym etapie.
2. **Layout:** zastąpienie obecnego prostego navbara w `(app)/layout.tsx`
   layoutem AdminCN. Bez równoległej strefy — jedna powłoka dla
   `/dashboard`, `/orgs`, `/settings`, `/users`.
3. **TanStack Query:** tylko w Client Components. RSC dalej robi guard,
   metadata i fetch przez `lib/api` (server). Bez SSR prefetch +
   `HydrationBoundary` w tym etapie.
4. **i18n + auth:** zostają boilerplate'owe — `next-intl` z prefixem
   `[locale]`, `proxy.ts` bez zmian, Better Auth + `requireSession`. Strony
   auth z template'u to tylko UI; logika (akcje, sesja, forward cookie)
   zostaje z boilerplate'u.

## Słownik (obowiązuje w każdej fazie)

- **Next = frontend server.** Renderuje strony, robi locale-redirect i stawia
  nagłówki (CSP/nonce). Nie ma własnych endpointów danych (`app/api/*` nie
  wraca), nie autoryzuje, nie liczy limitów.
- **Nest = główne API.** Jedyne źródło danych (`/v1/*` wg
  `packages/contracts/openapi.yaml`). Każdy odczyt i zapis — z przeglądarki
  i z komponentów serwerowych — idzie tam przez HTTP.
- **`src/lib/api` (RSC) = klient serwerowy.** Server Components i layouty
  wołają Nest przez `api()` z forwardem cookie (`getCookie`). Bez zmian.
- **`src/lib/query/*` (browser) = klient przeglądarkowy.** Client Components
  wołają Nest przez `createApiClient({ baseUrl: NEXT_PUBLIC_API_BASE_URL })`
  bez `getCookie` — `credentials: "include"` już jest w `@repo/api-client`.
- **`fake-db` nie istnieje.** Każdy mock z template'u (`src/fake-db/*`, mockowe
  `app/api/*`, `server/*`) jest przy przenoszeniu zastępowany hookiem do
  NestJS albo jawnie oznaczony jako TODO z brakującym endpointem w Nest.
- **RSC robi:** `requireSession`, `generateMetadata`, `getTranslations`,
  przekazanie sesji/orgów jako props. **Client robi:** `useQuery` /
  `useMutation`, sortowanie/filtry/paginacja, wykresy, toasty.

## Zasady globalne (obowiązują w każdej fazie)

- 1 faza = 1 commit na main, po nim `typecheck + lint + format + build` zielone.
- Każdy przeniesiony flow zachowuje kontrakt: te same statusy, ten sam envelope
  `{ error, issues? }`, te same semantyki (jak w etapie 3).
- Template kopiujemy do `/tmp`, nigdy bezpośrednio do `apps/web` — do repo
  trafiają tylko wybrane, zaadaptowane pliki (patrz tabela mapowania w fazie 0).
- Zakaz kopiowania z template'u: `src/app/api/*`, `src/server/*`,
  całego `globals.css` (tylko wybrane tokeny — patrz faza 2), stron auth jako
  tras (tylko JSX jako UI do istniejących tras boilerplate'u).
- Każdy `Link` / `redirect` / `useRouter` z template'u przechodzi na odpowiednik
  z `@/lib/i18n/navigation` (prefix `[locale]`). Goły `next/link` w nowym kodzie
  to błąd.
- Każdy hardcoded string z template'u przechodzi na `next-intl`
  (`getTranslations` w RSC, `useTranslations` w client). Nowy UI bez kluczy
  w katalogu tłumaczeń to błąd.
- Test pod `CSP_MODE=enforce`, nie `off` (w szczególności Recharts i obrazki
  z template'u).
- Atrybucja MIT (link `ShadcnStudio`) ląduje w stopce w fazie 6 — nie wcześniej
  (wcześniej template nie jest jeszcze widoczny), ale nie później (wymóg licencji).

## Topologia tras (docelowa)

```
[locale]/
  (app)/                        ← nowy AdminShell (sidebar + header)
    layout.tsx                  ← requireSession + orgs (server) + <AdminShell>
    dashboard/page.tsx          ← RSC (metadata) + <OrdersView> (client, Query)
    users/page.tsx              ← NOWE: lista (client, TanStack Table + nuqs)
    users/[id]/page.tsx         ← NOWE: podgląd użytkownika (client)
    settings/...                ← istniejące trasy, UI z views/pages AdminCN
    orgs/...                    ← bez zmian tras, w nowym shellu
    admin/...                   ← bez zmian tras, w nowym shellu
  login/ signup/                ← istniejące trasy, reskin UI z AdminCN
  forgot-password/              ← jw.
  reset-password/ verify-email/ ← jw.
```

Dylemat `/users` vs `/orgs` vs `/admin` rozstrzyga faza 0 (inwentaryzacja
endpointów Nest: co zwraca `GET /v1/organizations`, czy istnieje
`GET /v1/users`, co pokazuje widok Users w template). Domyślna propozycja:
`/users` dla widoku AdminCN; `/orgs` i `/admin` bez zmian.

---

## Faza 0 — Inwentaryzacja template'u (spike, zero zmian w app)

Cel: dokładna lista plików do przeniesienia + lista kolizji, zanim cokolwiek
ruszymy w `apps/web`.

1. Sklonuj template do `/tmp/admincn-free` (płytko, jeden branch):
   `git clone --depth 1 https://github.com/shadcnstudio/shadcn-nextjs-admincn-admin-template-free`.
2. Spisz inwentaryzację (plik roboczy, nie commitowany albo sekcja w tym docs):
   - `src/configs/navConfig.tsx` — pozycje menu → mapowanie na trasy boilerplate'u.
   - `src/configs/themeConfig.ts` — które tokeny naprawdę potrzebne.
   - `src/components/layout/*` — sidebar, header, shell: zależności (context, hooks).
   - `src/components/ui/*` — diff z `apps/web/src/components/ui` (co dodać, co już jest).
   - `src/views/dashboards/orders/*`, `src/views/apps/users/*`,
     `src/views/pages/{user-settings,user-profile}/*`, `src/views/pages/auth/*`.
   - `src/fake-db/*` — każdy mock → docelowy endpoint Nest (`GET /v1/...`) albo TODO.
   - `src/hooks/*`, `src/lib/*`, `src/utils/*`, `src/types/*` — co jest generyczne.
3. Porównaj wersje: `@radix-ui/*`, `react-hook-form`, `@hookform/resolvers`,
   `recharts`, `nuqs`, `sonner`, `lucide-react`, `zod` (template vs
   `apps/web/package.json`). Kolizje rozstrzygnij przed fazą 1.
4. Rozstrzygnij mapowanie tras Users (`/users` vs `/orgs` vs `/admin`) na
   podstawie endpointów Nest (`apps/api/src/organizations`, `apps/api/src/admin`).
5. Weryfikacja: tabela mapowania plik→cel + lista kolizji zależności + lista
   brakujących endpointów Nest. Bez tego nie startuje faza 1.

## Faza 1 — Fundament TanStack Query

Status: DONE (2026-10-11). Dowiezione: `@tanstack/react-query` +
`@tanstack/react-query-devtools` (dev) + `@tanstack/react-table` + `nuqs` +
`recharts` + `react-hook-form` + `@hookform/resolvers` w `apps/web`;
`src/lib/query/{client,api-browser,keys,provider,hooks/use-health}` +
`src/components/api-status.tsx` (PoC na dashboardzie, do zastąpienia w fazie 3);
`QueryProvider` + `NuqsAdapter` w root `[locale]/layout.tsx`;
`e2e/query-foundation.spec.ts` 5/5 zielonych. Zod zostaje v4, `date-fns`
odłożony do fazy 4, `cmdk`/`input-otp`/`react-resizable-panels` nie dodane —
zgodnie z tabelą z fazy 0.

Cel: działający Query w Client Components + proof-of-concept na żywym endpoincie.

1. Zależności do `apps/web/package.json`: `@tanstack/react-query`,
   `@tanstack/react-query-devtools` (dev), oraz wg wyniku fazy 0: `recharts`,
   `@tanstack/react-table`, `react-hook-form`, `@hookform/resolvers`, `nuqs`.
2. Nowe pliki:
   - `src/lib/query/client.ts` — singleton `QueryClient` na browser
     (nie tworzyć nowego na każdy render). `defaultOptions`: `staleTime ~30s`,
     `retry: 1` dla `GET`, brak retry dla 401/403.
   - `src/lib/query/provider.tsx` — `"use client"`, `QueryClientProvider` +
     `<ReactQueryDevtools>` tylko w dev.
   - `src/lib/query/api-browser.ts` — `createApiClient({ baseUrl:
clientEnv.NEXT_PUBLIC_API_BASE_URL })` bez `getCookie`.
   - `src/lib/query/keys.ts` — fabryka kluczy: `['orders', filters]`,
     `['users', params]`, `['profile']` itd.
   - `src/lib/query/hooks/*` — hooki per domena (np. `useOrders`,
     `useUsers`, `useUser(id)`, `useUpdateProfile`); mutacje z
     `invalidateQueries` + toast `sonner` + mapowanie `ApiError` na kształt
     `{ error, issues? }`.
3. Wpięcie `<QueryProvider>` w `app/[locale]/layout.tsx` (obok `ThemeProvider`)
   albo w `(app)/layout.tsx` — jedno miejsce, bez dublowania.
4. CSP: dopisz origin API do `connect-src` jeśli `src/lib/security/csp.ts` go
   nie dopuszcza — inaczej przeglądarka zablokuje zapytania Query.
5. Proof-of-concept: jeden widok na `GET /v1/health` (lub `/v1/session`)
   przez `useQuery`, ze stanami loading/error.
6. Weryfikacja: `pnpm --filter web typecheck && lint`, PoC działa z
   `credentials: "include"`, 401 nie retryuje, `CSP_MODE=enforce` bez błędów
   w konsoli. Commit.

## Faza 2 — Shell AdminCN zamiast prostego navbara

Cel: jedna powłoka z sidebarem dla całej strefy `(app)`, guard i dane bez zmian.

1. Przenieś z adaptacją (`@/*`, `[locale]`, `@/lib/i18n/navigation`):
   `configs/navConfig.tsx` (hrefy na `/dashboard`, `/users`, `/settings`, …),
   `configs/themeConfig.ts`, `components/layout/*`.
2. Przepisz `app/[locale]/(app)/layout.tsx`: zostaje `requireSession` + fetch
   orgów przez `api()` (server); dalej render `<AdminShell orgs={...}
user={...}>` zamiast obecnego headera. `AccountSwitcher`,
   `NotificationBell`, `ThemeToggle` wkomponuj w header AdminCN.
3. Style: nie nadpisuj `app/globals.css` całością z template'u. Przenieś tylko
   brakujące tokeny/animacje (sidebar, kolory wykresów) jako rozszerzenie
   obecnych tokenów HSL. Dark mode zostaje na `next-themes` z `nonce`.
4. `proxy.ts` bez zmian — nowe ścieżki automatycznie dostają prefix locale i CSP.
5. Weryfikacja: `/pl/dashboard` renderuje sidebar+header, collapse działa,
   dark mode bez flasha, PL/EN, mobile. Commit.

## Faza 3 — Orders dashboard na żywych danych

Cel: pierwszy widok biznesowy na danych z NestJS, zero mocków.

1. Zmapuj `views/dashboards/orders/*` (statystyki, wykresy Recharts, widgety,
   tabela) na `src/features/orders/` (konwencja boilerplate'u: moduły
   pionowe w `src/features/*`).
2. Każdy mock `fake-db` dla orders → hook (`useOrdersSummary`,
   `useOrdersList`, z `nuqs` do paginacji/filtrów w URL).
3. `dashboard/page.tsx` zostaje RSC (metadata + `getTranslations`); cała
   interaktywna treść to Client Component pod spodem.
4. Typy odpowiedzi z `@repo/contracts` / Zod, nie z typów template'u.
5. Brakujący endpoint w Nest (`/v1/orders/summary` lub odpowiednik) — dopisz
   w `apps/api` w ramach tej fazy; tymczasowe podpięcie istniejących
   endpointów jest dozwolone tylko z jawnym TODO.
6. Weryfikacja: dashboard bez `fake-db`, stany loading/error/empty,
   odświeżanie po mutacji (`invalidateQueries`), tłumaczenia PL/EN. Commit.

## Faza 4 — Users + Settings/Profile

Cel: lista i podgląd użytkowników + settings/profile na formularzach RHF+Zod
podpiętych do Nest.

1. Users list/view (`views/apps/users/*` + TanStack Table): trasy wg decyzji
   z fazy 0 (`/users`, `/users/[id]` — propozycja). Dane z Nest
   (`GET /v1/users` lub `GET /v1/organizations` — wg fazy 0).
2. User Settings / User Profile (`views/pages/*`): podepnij pod istniejące
   `/(app)/settings/*` zamiast dublować ścieżki template'u (`/pages/...`).
3. Formularze: błędy API (`ApiError.issues`) → `form.setError`, sukces →
   toast + invalidacja `['profile']` / `['users']`.
4. Tłumaczenia: nowe katalogi `users`, `settings`, `profile` w `next-intl`.
5. Weryfikacja: lista z sortowaniem/filtrami w URL (`nuqs`), edycja profilu
   zapisuje do Nest, zero odwołań do `fake-db`. Commit.

## Faza 5 — Auth UI reskin (bez ruszania logiki)

Cel: wygląd AdminCN na istniejących trasach i akcjach boilerplate'u.

1. Trasy zostają: `/login`, `/signup`, `/forgot-password`, `/reset-password`,
   `/verify-email`. Z template'u bierzemy tylko JSX/CSS (`views/pages/auth/*`
   - `(blank)` layout jako inspirację).
2. Akcje (`features/auth/*`, Better Auth, wywołania Nest) bez zmian. Two-steps
   z template'u tylko jeśli Nest/Better Auth go wspiera — inaczej pomiń z
   jawną notatką.
3. CSP: sprawdź inline SVG/obrazki z template'u (`img-src`, `style-src`).
4. Weryfikacja: pełny przepływ signup → verify → login → forgot → reset
   działa E2E, style spójne z dashboardem. Commit.

## Faza 6 — Porządki i szlif

Cel: repo bez resztek template'u, licencja domknięta, pełna zieleń.

1. Usuń resztki `fake-db`, martwe `views`, nieużywane duplikaty `ui`;
   ujednolic `components/ui` (boilerplate jako baza, brakujące warianty
   z template'u jako dodatek).
2. Mail/Calendar z template'u nie są kopiowane — decyzja z nagłówka tego docs.
3. Atrybucja MIT: link `ShadcnStudio` w stopce.
4. Weryfikacja: `pnpm typecheck && lint && build`, `test:e2e` (Playwright),
   test ręczny PL/EN + light/dark + mobile. Commit.

## Otwarte punkty (rozstrzyga faza 0, nie później)

- Mapowanie tras Users: `/users` vs `/orgs` vs `/admin` (zależy od endpointów Nest).
- Miejsce `<QueryProvider>`: root `[locale]/layout.tsx` vs `(app)/layout.tsx`.
- Lista brakujących endpointów Nest pod Orders/Users (co dopisać w `apps/api`).
- Ostateczna lista nowych zależności i sposób rozwiązania kolizji wersji.
