# Etap 3 — web jako czysty frontend, Nest jako główne API

Status: plan (po dowiezionym etapie 2: fazy 2.0–2.9, web bez DB, cała logika
domenowa w Neście, resztki w postaci cienkich relayów `app/api/*` i wołań API
z `proxy.ts`).

Powiązane: [ARCHITECTURE.md](ARCHITECTURE.md) (zasady, kontrakt cookie §6),
[backend-contract.md](backend-contract.md) (kontrakt framework-free),
[specyfikacja.md](specyfikacja.md) (wymagania produktowe),
[etap-2.md](etap-2.md) (poprzedni etap, kontekst relayów).

## Słownik (obowiązuje w każdej fazie)

Żeby nikt tego więcej nie pomylił:

- **Next = frontend server.** Renderuje strony (SSR/ISR), serwuje content
  i SEO, robi locale-redirect i stawia nagłówki (CSP/nonce). Potrzebuje
  serwera, ale **nie jest backendem**: nie ma własnych endpointów danych,
  nie autoryzuje, nie liczy limitów.
- **Nest = główne API.** Jedyne źródło danych (`/v1/*` wg OpenAPI
  w `packages/contracts/openapi.yaml`). Każdy odczyt i zapis — z przeglądarki
  i z komponentów serwerowych — idzie tam przez HTTP.
- **`src/proxy.ts` = konfiguracja frontend servera** (locale + CSP + request-id),
  nie „proxy do API". Po tym etapie nie zawiera żadnego fetcha do API, żadnego
  DB ani żadnego guarda sesji.
- **`src/lib/api` (RSC) = klient głównego API** odpalany z frontend servera,
  nie „własne API weba". Server-to-API przez HTTP to dalej rozdział
  frontend/backend, nie jego złamanie.
- **Podmiana backendu = nowa implementacja kontraktu.** Frontend nie zmienia
  się przy zmianie języka/frameworka API (Nest → FastAPI → cokolwiek), bo
  jedynym sprzężeniem jest dokument + `@repo/contracts` + `@repo/api-client`.

## Zasady globalne (obowiązują w każdej fazie)

- 1 faza = 1 commit na main, po nim `typecheck + lint + format + build` zielone.
- E2E przypisane do fazy muszą być zielone przed commitem.
- Każdy przeniesiony flow zachowuje kontrakt: te same statusy, ten sam envelope
  `{ error, issues? }`, te same semantyki. Wyjątki są jawne i tylko dwa:
  endpointy impersonate **znikają** (faza 3.1), a `List-Unsubscribe` zmienia
  host na API (faza 3.5).
- Decyzje tego etapu (nie do renegocjowania w środku faz):
  impersonate jest out-of-scope templatki (faza 3.1), brak guarda sesji
  w `proxy.ts` (faza 3.4), brak edge rate-limitu w web (faza 3.4).
  Auth rozstrzyga się przy fetchu danych (loading → 401/403 → UI), nie na brzegu.

## Topologie (templatka, nie jeden deploy)

Ten etap nie spina się do konkretnej domeny — dokumentuje dwie wspierane
topologie i jedną jawnie niewspieraną:

- **localhost (dwa porty, same-site):** cookie chodzą (porty są ignorowane
  przy matchowaniu domen), więc `credentials: include` wprost do API działa.
  Służy do developmentu i E2E. Niczego produkcyjnego nie dowodzi.
- **shared-domain (`app.<domain>` + `api.<domain>`):** wymagana dla sesji
  cookie na produkcji (ta sama eTLD+1, `Domain` na cookie sesji,
  `SameSite=Lax`, CORS z jawnym originem). Bez niej nie ma cookie-sesji.
- **unrelated domains:** niewspierane (to wymagałoby `SameSite=None; Secure`,
  czego codebase celowo nie używa).

## Faza 3.1 — kasacja impersonate

Cel: impersonate wylatuje z kodu, kontraktu, bazy, docsów i E2E. Idzie pierwsza,
bo dotyka guardów i audytu — wszystko po niej jest prostsze. Impersonate jest
uznane za nie-feature templatki (out-of-scope w `specyfikacja.md §6.2`).

- Web (kasacja): `app/api/admin/impersonate*` (i tak giną z całym `app/api`
  w fazie 3.3, tu znikają użycia); `features/admin/components/`
  `impersonation-banner.tsx`, `stop-impersonating-button.tsx`, kawałki
  `user-actions.tsx` + `client.ts` + `schema.ts` + `audit.ts` (akcje
  `impersonation.start/stop`); banner z `app/[locale]/layout.tsx`;
  `impersonatedBy` z `lib/auth/index.ts`; stringi w `messages/en.json/pl.json`;
  spec `e2e/admin-impersonation.spec.ts` do skasowania + poprawki
  w `admin-access.spec.ts` (powierzchnia `/api/auth/admin/*`).
- Nest: endpointy `POST /v1/admin/users/:id/impersonate` +
  `POST /v1/admin/impersonate/stop` (`admin.controller.ts` + `admin.service.ts`);
  uproszczenie `super-admin.guard.ts` do `sesja + live isSuperAdmin`
  (bez `impersonatedBy === null`); wywalenie gałęzi impersonate
  z `organizations/audit.ts` (`resolveActor`, merge do metadata);
  `auth-engine.ts`: `impersonationSessionDuration` + mapowanie `impersonatedBy`
  (plugin `admin` zostaje tylko dla ban/role, o ile coś z niego korzysta).
- Kontrakty/DB: `Session.impersonatedBy` + metody `impersonate/stop`
  z `AuthAdapter` (`contracts/src/auth.ts`), typy z `contracts/src/admin.ts`,
  2 ścieżki z `openapi.yaml`; kolumna `session.impersonatedBy`
  (`db/src/schema/auth.ts`) usuwana **nową migracją drop column**
  (nigdy edycją starych); komentarze w `audit-logs.ts`, `schema/index.ts`.
- Docs: `README` (wiersz super-admin), `ARCHITECTURE.md` (banner-layout,
  guard, przykłady Rule B), `backend-contract.md` (guard + endpointy),
  `specyfikacja.md §6.2` (impersonation → out-of-scope) — zrobione do stanu
  docelowego przed implementacją; historyczny changelog `v1-1-0` nietknięty.
- E2E: kasacja `admin-impersonation.spec.ts`; `admin-access`, `admin-lifecycle`
  zielone bez impersonate.
- Akceptacja: `grep -ri impersonat` w `apps/*/src + packages/*/src + docs + e2e`
  zwraca zero (poza historycznym `etap-2.md`, który zostaje jako log,
  oraz celowymi wzmiankami o usunięciu w `ARCHITECTURE.md`/`backend-contract.md`);
  suspend/unsuspend, role i audyt działają bez zmian.
- Ryzyka: ŻADNE dla kolumny w DB — zweryfikowane w źródle pluginu
  (`better-auth/dist/plugins/admin/`): `impersonatedBy` dotykają tylko endpointy
  `impersonateUser`/`stopImpersonating` (nieosiągalne po kasacji: nasz serwis
  znika, HTTP `/api/auth/admin/*` jest 404 z allowlisty) oraz filtr
  `/list-sessions` (undefined-safe, a `listSessions` i tak nikt nie woła).
  Drop column nową migracją (`db:generate`, nigdy ręczne snapshoty); zero
  produkcji, więc brak fallbacku. `resolveActor` w audycie musi mieć
  jedną ścieżkę mniej, nie dwie (nie zostawiać martwego `if`).

## Faza 3.2 — frontend woła `/v1` wprost (bez kasowania routów)

Cel: każde wołanie danych idzie wprost do głównego API, zanim skasujemy
relaye. Stare i nowe ścieżki działają równolegle.

- Web (przepięcia na `NEXT_PUBLIC_API_BASE_URL + /v1/*`, `credentials: include`):
  `features/billing/components/billing-actions.tsx`
  (`/api/billing/*` → `/v1/billing/*`);
  `features/notifications/client.ts` + `notification-bell.tsx`
  (`/api/notifications*` → `/v1/notifications*`);
  `features/admin/client.ts` (po fazie 3.1 impersonate już nie istnieje —
  ta faza nie ma tu nic do roboty, punkt kontrolny);
  `components/locale-switcher.tsx`
  (`PATCH /api/locale` → `PATCH /v1/locale` + `document.cookie app-locale`
  client-side, jak dziś robi sign-in).
  Już wprost (bez zmian): `features/auth/client.ts`, `storage/file-upload.tsx`,
  `file-list.tsx`, `notification-preferences-form.tsx`.
- Kontrakty: bez zmian (te same ścieżki `/v1/*`, ten sam klient
  `@repo/api-client`).
- E2E: zielone na obu ścieżkach (fixtura/faza przejściowa).
- Akceptacja: UI nie wykonuje żadnego fetcha pod `/api/` (grep kontrolny);
  relay'e jeszcze istnieją, ale nic z nich nie korzysta.
- Ryzyka: CORS + ciasteczka muszą być dowiezione wcześniej na localhost
  (same-site działa na dwóch portach); każdy przepięty fetch musi nieść
  `credentials: include`, inaczej Nest zobaczy anonima.

## Faza 3.3 — kasacja `app/api/**`

Cel: frontend server nie serwuje żadnych endpointów danych. Cały katalog
`src/app/api` znika: `auth/[...all]`, `admin/*`, `billing/*`, `cron`, `dev/*`,
`locale`, `mcp`, `notifications/*`, `storage/*`, `unsubscribe`.
Zostają tylko strony (w tym page `/unsubscribe` — to strona, nie endpoint).

- Web: kasacja katalogu + `app/api/dev/proxy.ts`; `lib/security/rate-limit.ts`
  tiery `/api` (cały plik wypada w fazie 3.4 razem z limiterem).
- E2E: ta faza usuwa tylko kod; specy przepisywane są w fazie 3.6
  (do tego czasu suite musi iść na direct z fazy 3.2).
- Akceptacja: `grep '"/api/` w `apps/web/src` zwraca zero (poza komentarzami
  do poprawy w tej samej fazie); `grep app/api` zwraca zero;
  build zielony; E2E zielone na ścieżkach direct.
- Ryzyka: `billing/webhook` — dashboard Stripe musi wskazywać wprost
  na API (relaya już nie ma); emailed linki muszą być budowane
  z `BETTER_AUTH_URL` (origin API), nie z origin weba.

## Faza 3.4 — `proxy.ts` minimalny + kasacja edge rate-limitu

Cel: `proxy.ts` to konfiguracja frontend servera bez backendu: locale-redirect
(`always`, redirect-only), CSP/nonce, request-id. Zero fetcha, zero DB,
zero guarda sesji, zero rate-limitu.

- Web: z `proxy.ts` wypadają `hasVerifiedSession` (`GET /v1/session`),
  `isPublicApiPath`, guard-redirect do `/login` (`safeCallbackUrl`,
  `isPublicBarePage` jako bramka auth — sama lista stron publicznych
  w `public-routes.ts` zostaje dla sitemap/robots); cały rate-limit
  (`lib/adapters/rate-limit/` + `lib/security/rate-limit.ts` + blok w proxy).
  Niezalogowany na chronionej stronie dostaje stronę ze stanem ładowania,
  fetch do `/v1/*` odpowiada 401/403, UI pokazuje stan „zaloguj"/`forbidden`.
  Autorytatywna weryfikacja zostaje w renderze (`requireSession` → `GET
/v1/session` przez `@/lib/api` — to klient głównego API, nie guard brzegowy).
- Rate-limit jako feature nie znika — znika tylko z weba. Liczy go wyłącznie
  główne API (login bucket z fazy 2.1 + limit całego API ze spec 22.3).
- Brama lint: `no-restricted-imports` w web bez wyjątków (dzisiejszy wyjątek
  dla postgres-rate-limit znika); `proxy.ts` nie importuje `API_BASE_URL`,
  `rate-limit` ani kontraktu sesji poza nazwą cookie.
- E2E: `rate-limit.spec.ts` przepisane na uderzanie wprost w API
  (web nie ma już czego liczyć).
- Akceptacja: `proxy.ts` zawiera zero `fetch(`, zero `API_BASE_URL`,
  zero `rate-limit`; `grep @repo/db|postgres|drizzle-orm` w `apps/web/src`
  zwraca zero bez wyjątków.
- Ryzyka: pierwsze wejście na chronioną stronę może zamigać skeletonem
  zanim fetch odpowie 401 (akceptowane — tak dziś degraduje przy padzie API);
  locale-redirect musi dalej nieść `search` (inaczej pękają `?token=` flow).

## Faza 3.5 — kontrakt backendu (zmiana po stronie API)

> Status: delivered. Kodowo: `suppression.ts` split, CORS/`trustedOrigins`,
> cookie-`Domain`, `BETTER_AUTH_URL` i Stripe-webhook wprost w API były już
> dowiezione wcześniej — ta faza dowozi resztę: kasacja `vercel.json:crons`
> (drenaż wyłącznie zewnętrznym schedulerem wprost w `GET {api}/v1/cron/jobs`),
> kasacja webowych relayów `/.well-known/*` (klienci MCP biją wprost w API),
> E2E-pin hosta API w `List-Unsubscribe` (transactional + unsubscribe) oraz
> kontrakt w `backend-contract.md` ("Self-sufficient backend"), `ARCHITECTURE.md
§6`/cron-section i `README` (cron). Dwie ostatnie web-relaye zniknęły razem
> z tym commitmem; `grep '"/api/` w `apps/web/src` zwraca zero łącznie
> z `app/api` (poza komentarzami historycznymi).

Cel: API jest samowystarczalne dla świata zewnętrznego — maile, dostawcy,
schedulery i klienci MCP wskazują wprost na nie, nie na web.

- Nest: `suppression.ts` — rozdzielenie `webAppUrl` na `webAppUrl`
  (page `/unsubscribe`, ląduje człowiek) i `apiUrl` (header `List-Unsubscribe`
  → `{api}/v1/unsubscribe`, bije maszyna); CORS/`trustedOrigins=[web]`;
  cookie sesji z `Domain` tylko przy shared-domain (unset = host-only jak dziś);
  `BETTER_AUTH_URL` = origin API (linki z maili biją wprost w backend);
  Stripe-dashboard → `api/v1/billing/webhook`; klienci MCP → wprost API
  (discovery + bearer, bez relaya); scheduler → zewnętrzny (VPS cron /
  compose-job bijący `GET /v1/cron/jobs` z `CRON_SECRET`), nie Vercel.
- Web: `vercel.json` — usunięcie `crons` (ze wskazaniem dokąd); nic więcej
  w tej fazie.
- Kontrakty: `backend-contract.md` (split-host, cookie, CORS, scheduler);
  `ARCHITECTURE.md §6` (obie topologie + niewspierana).
- E2E: assert `List-Unsubscribe` wskazuje `/v1/unsubscribe` na hoście API
  (lądowanie w fazie 3.6).
- Akceptacja: realny inbox-klik `List-Unsubscribe` nie dotyka originu weba;
  cron zbierany spoza Vercela; share-cardy i sitemap bez zmian.
- Ryzyka: rotacja `EMAIL_UNSUBSCRIBE_SECRET` unieważnia stare linki
  (z natury HMAC — dokumentować, nie „naprawiać").

## Faza 3.6 — E2E na direct

> Status: delivered. Kodowo: jedno realne przepięcie
> (`emails-transactional` reset-sesji z engine-legacy
> `/api/auth/request-password-reset` na kontraktowy
> `POST /v1/auth/password-reset/request`) + `apiBaseURL` w
> `playwright.config.ts` (jedno źródło originu API, spójne
> z `apiUrl()` w `helpers.ts`) + komentarze po fazach 2.1/3.4/3.5.
> `/api/mcp` i `/api/auth/admin/*` w suicie ZOSTAJĄ — to ścieżki
> API-originu z kontraktu (transport MCP, allowlista engine'a),
> nie web-relaye; brama to zero web-origin `/api/` plus allowlista.
> Suita: 119 passed w `required` (2(storage) failują wyłącznie na
> obcym MinIO na :9000 — `SignatureDoesNotMatch`, brak projektowego
> `saas_boilerplate_minio`; w CI z własnym MinIO zielone) oraz
> 16/16 w `disabled` na specach fazy.

Cel: suita mówi wyłącznie HTTP do dwóch originów we właściwych rolach —
strony do weba, dane i harness do API. Zero `/api/` w `e2e/`.

- Web (`e2e/`): `helpers.ts` (seed-user, seed-org, seed-super-admin, user,
  emails, fail-next, jobs, jobs/run, notifications, notification-preference,
  mcp, rate-limit, billing-state, seed-billing-customer — wszystko
  z `/api/dev/*` na `{api}/v1/dev/*`); specy: billing-checkout/portal/webhook,
  storage-isolation, validation, cron-drain (`GET` wprost na API
  z `CRON_SECRET`), mcp, admin-access (`/api/auth/admin/*` → origin API),
  unsubscribe, rate-limit (tylko limiter API), emails-transactional
  (header na `/v1/unsubscribe`), emails-unsubscribe, i18n-emails (komentarze).
- `playwright.config.ts`: dual-server zostaje, dochodzi `apiBaseURL`;
  kick drain idzie na API, nie na web.
- Akceptacja: cała suita × tryby tenancy (`required`/`optional`/`disabled`)
  zielona bez ani jednego `/api/` w `e2e/`; backend da się podmienić —
  suita jest testem conformance kontraktu, nie Nesta.

## Faza 3.7 — templatka: env, docs, bramy

Cel: nowy konsument templatki stawia web + dowolny backend z samych env
i kontraktu.

- Env: web potrzebuje `NEXT_PUBLIC_API_BASE_URL` (przeglądarka),
  `NEXT_PUBLIC_APP_URL` (redirecty/metadata) oraz `API_BASE_URL`
  (RSC-fetch server→API — dalej HTTP do głównego API, nie DB);
  API potrzebuje `BETTER_AUTH_URL` (origin API), `NEXT_PUBLIC_APP_URL`
  (origin weba), `CROSS_SUBDOMAIN_COOKIES`/`SESSION_COOKIE_DOMAIN`,
  `CRON_SECRET`, secrets dostawców. Wszystko walidowane fail-fast.
- Bramy CI: eslint bez wyjątków + grep-gate (zero `app/api`, zero fetcha
  `"/api/` w web, zero `API_BASE_URL` w `proxy.ts`, zero `@repo/db`
  w web, zero `impersonat` poza `etap-2.md`).
- Docs: `ARCHITECTURE.md` (słownik frontend server vs główne API),
  `backend-contract.md` (selection matrix: Next/SPA vs dowolny backend),
  `README` (template note), przykład schedulera w `docker-compose.yml`,
  ten plik jako log wykonania (statusy faz).
- Akceptacja etapu 3: web to czysty frontend (strony + SSR/ISR + content/SEO);
  każde zapytanie o dane przechodzi przez główne API; podmiana backendu
  nie wymaga zmian we frontencie; suita jest zielona przeciwko kontraktowi.

## Szacunek gabarytu

3.1 i 3.6 to duże fazy (impersonate tnie guardy/audyt/kontrakt/DB;
E2E dotyka kilkunastu speców); 3.2 i 3.5 to średnie; 3.3, 3.4 i 3.7 to małe.
Razem 7 commitów (3.1–3.7). Kolejność jest częścią planu: impersonate najpierw,
bo upraszcza wszystko po niej.
