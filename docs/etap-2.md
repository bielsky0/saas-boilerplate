# Etap 2 — pełny port do NestJS (web = czysty frontend)

Status: plan (po dowiezionym etapie 1: monorepo Turborepo + `apps/web`,
`@repo/*`, bootstrap `apps/api` na Express, slice powiadomień przez Nest).

Powiązane: [ARCHITECTURE.md](ARCHITECTURE.md) (konwencje, seam-y),
[specyfikacja.md](specyfikacja.md) (wymagania produktowe).

## Zasady globalne (obowiązują w każdej fazie)

- 1 faza = 1 moduł = 1 commit na main, po nim `typecheck + lint + format + build` zielone.
- E2E przypisane do fazy muszą być zielone przed commitem (dev-seamy portowane
  razem z modułem, nie na końcu).
- Każdy przeniesiony flow zachowuje kontrakt: te same statusy, ten sam envelope
  `{ error, issues? }`, te same semantyki ciche/głośne.
- Po fazie moduł nie ma w web ani jednego importu `@repo/db` (sprawdzane grepem).

## Faza 2.0 — fundament: dual-server E2E + długi z etapu 1

Po co: dziś Playwright startuje tylko web; od tej fazy każdy slice testujemy
przeciw web+api.

- Nest: nic (tylko health).
- Infra: `apps/web/playwright.config.ts` → drugi `webServer` (api na :3001,
  `command: pnpm --filter api start`, env: ten sam `DATABASE_URL` co web +
  `BETTER_AUTH_SECRET`); `turbo.json` → dopisać `env: [DATABASE_URL, ...]`
  do taska `db:migrate` (dziś cache ignoruje zmianę bazy — złapało nas w K5).
- E2E: brak zmian w specach; puste przebiegi obu serwerów startują.
- Akceptacja: `pnpm test:e2e -- e2e/content-no-js.spec.ts` przechodzi na dwóch
  serwerach; `DATABASE_URL=... pnpm db:migrate` 2× pod rząd migruje (nie cache-hit).

## Faza 2.1 — Auth full port (fundament, największa)

Cel: rejestracja, logowanie, wylogowanie, reset hasła, weryfikacja maila —
wszystko w Neście. Web nie trzyma już ŻADNEJ logiki auth.

- Nest (nowe): `auth/` — kontrolery `POST /v1/auth/sign-up`,
  `POST /v1/auth/sign-in`, `POST /v1/auth/sign-out`,
  `POST /v1/auth/password-reset/request`,
  `POST /v1/auth/password-reset/confirm`, `GET /v1/auth/verify-email`
  (link z maila bije wprost w Nest); pełny silnik Better Auth (email+password,
  hooki z web: `session.create.before` blokada skasowanych,
  `user.create.before/after` locale + personal account, wysyłki maili przez
  kolejkę); login rate-limit (peek przed hashem, consume przy failu, reset przy
  sukcesie — port 1:1 z `signInAction`, klucz IP-only, `RATE_LIMIT_*` do configu
  API); locale-seeding przy sign-in (`storedLocaleForEmail`).
- Kontrakty/env: `AuthAdapter` implementacja w Nest (docelowo jedyna); config
  API += `BETTER_AUTH_URL`, `RATE_LIMIT_*`, `EMAIL_*` (do wysyłek z hooków).
- Web (do zmiany): 4 formularze (`sign-in/up`, `forgot/reset`) → fetch do Nesta
  zamiast `useActionState`; `sign-out-button` → fetch;
  `app/api/auth/[...all]` → cienki reverse-proxy do Nesta (żeby linki
  weryfikacyjne i OAuth-callbacki nie pękły) + zachowany 404 na
  `/api/auth/admin/*`; `features/auth/actions.ts` → kasacja pliku;
  `lib/auth/index.ts` → klient sesji przez `GET /v1/session` (nowy endpoint
  w tej fazie).
- Cookies: sesję stawia Nest (`Set-Cookie` na odpowiedzi Nesta) — formularze
  wołają Nesta wprost z przeglądarki (`credentials: include`, CORS w Nest).
  Po udanym sign-in redirect przechodzi przez web-route, który stawia
  `app-locale` (szczegół do domknięcia w implementacji).
- E2E: `register-verify-login`, `login-enumeration`, `protected-redirect`,
  `context-switch` (cz. auth), `rate-limit` (login bucket) — bez zmian;
  dev-seamy `seed-user`, `user`, `rate-limit` do API (nowy dev-kontroler).
- Akceptacja: pełny flow rejestracja→weryfikacja→login→logout w UI przeciw
  Nestowi; enumeration-behavior identyczny (byte-identyczne komunikaty);
  5× zły login → blokada.
- Ryzyka: `nextCookies()` nie istnieje w Neście — ciasteczka sesji stawia core
  Better Auth (sprawdzić na żywym); timing anti-enumeration (dummy lookup)
  musi zostać po stronie Nesta.

## Faza 2.2 — Organizations (+ audit orgowy, REST wg OpenAPI)

Cel: 9 akcji orgowych + zaproszenia + audit trail w Neście, wystawione jako
zasoby REST. Source of truth: `packages/contracts/openapi.yaml`
(operationId stabilne, każdy przyszły backend — FastAPI, inny — implementuje
ten sam dokument; E2E waliduje kształt odpowiedzi).

- Nest: `organizations/` — pełne rzeczowniki, czasowniki tylko metodami HTTP
  (bez `/invite`, `/revoke`, `/leave`, `/accept` w ścieżce jako RPC):
  - `POST /v1/organizations` (create, `201 { id, name, slug }`)
  - `GET /v1/organizations` (lista orgów usera — switcher; bez tego web nie
    uwolni się od DB)
  - `GET /v1/organizations/{slug}` (`200 { id, name, slug, role }`)
  - `PATCH /v1/organizations/{slug}` (`{ name?, newSlug? }`; zajęty slug →
    `409 { error: SLUG_TAKEN }`, nie mylić z last-owner)
  - `DELETE /v1/organizations/{slug}` (`204`, soft-delete + audit
    `organization.delete`)
  - `GET /v1/organizations/{slug}/members` (port `listMembers`)
  - `PATCH /v1/organizations/{slug}/members/{memberId}` (`{ role }`)
  - `DELETE /v1/organizations/{slug}/members/{memberId}` (remove)
  - `DELETE /v1/organizations/{slug}/membership` (leave własny — osobny zasób,
    bo `member.leave` ≠ `member.remove`: actor = target, osobne akcje audytu)
  - `POST /v1/organizations/{slug}/invitations` (`{ email, role }` →
    `201 { id, email, role, status }`; zastępuje `/invite`)
  - `GET /v1/organizations/{slug}/invitations?status=pending` (port
    `listPendingInvitations`)
  - `DELETE /v1/organizations/{slug}/invitations/{invitationId}` (revoke,
    `204` idempotentnie; już-revoked też `204` bez audytu — reguła
    `.returning()` z `revokeInvitationAction`)
  - `POST /v1/invitations/{token}/accept` (token w path, nie w body;
    `{}` → `200 { slug }`, frontend robi `router.push`; `400 INVALID_TOKEN`
    gdy nie-pending/wygasło; zastępuje `POST /v1/invitations/accept`)
  - `GET /v1/organizations/{slug}/audit-logs?q=&from=&to=&page=` (port
    `audit-data.ts`; guard `audit.read`; `200 { items, page, hasNext }`;
    zastępuje `/audit`)
  - Alias kompatybilny: `POST /v1/orgs` → `308` do `/v1/organizations` przez
    jedną fazę, potem kasacja (nie dwie implementacje).
  - Guard `OrgPermissionGuard` (port `requireOrgPermission`: 404 brak
    orga/disabled, 403 brak roli/permission); transakcje w całości w Nest
    (invite: revoke-starych - insert + `recordAudit` + `enqueueEmail` w jednym
    `db.transaction`, Rule A); `LastOwnerError` → 409 `{ error: LAST_OWNER }`
    (web mapuje na komunikat formularza); token zaproszenia SHA-256 + TTL 7d,
    link z `NEXT_PUBLIC_APP_URL` (config API).
- Web: strony `/orgs/*` i `/invitations/[token]` zostają (render), formularze →
  fetch przez nowy `features/organizations/client.ts` (wrappery na
  `createApiClient`: `listOrgs, getOrg, createOrg, updateOrg, deleteOrg,
listMembers, updateRole, removeMember, leaveOrg, listInvites, createInvite,
revokeInvite, acceptInvite(token), listAuditLogs`); `actions.ts` → kasacja;
  `data.ts`/`audit-data.ts` query → endpointy powyżej.
- Kontrakty (Paczka A, framework-free): `packages/contracts/src/organizations.ts`
  (DTO: `Organization, Membership, Invitation, OrgAuditRow` — same
  JSON-prymitywy, zero typów Drizzle) + `packages/contracts/openapi.yaml`
  (paths + components/schemas + stabilne `operationId`); wire-schematy Zod
  w `packages/validation` z tych samych reguł (slug pattern, invitable/
  assignable roles).
- E2E: `invitation-accept`, `org-last-owner`, `org-audit-trail`,
  `context-switch`, `rbac-enforcement`, `multi-tenancy-mode` zielone; dev-seam
  `seed-org` do API.
- Akceptacja: invite→mail→accept dla nowego i istniejącego usera;
  demote/remove ostatniego ownera zablokowane; audit z `changes{from→to}`;
  member dostaje 403 na settings; `disabled` → 404 na orgach.
- Ryzyka: `FOR UPDATE` + `lockActiveOwnerCount` w transakcji Nesta (ten sam SQL,
  inny pool — sprawdzić); mail zaproszeniowy to tylko INSERT do kolejki
  (wysyłka ruszy z fazą 2.3).

## Faza 2.3 — Jobs + Emails + Onboarding + Cron (+ preferences)

Cel: kolejka, jedyna ścieżka wysyłki, sekwencja onboardingowa, cron-drain,
creation-pipeline powiadomień, formularz preferencji.

- Nest: `jobs/` (enqueue + claim `FOR UPDATE SKIP LOCKED` + backoff
  `30s·4^(n-1)` + dead-letter + registry: `email.send`, `onboarding.step`,
  `billing.notify`, `notification.create`, `job.prune`, `storage.purge`,
  `ratelimit.prune`); `emails/` (send-time suppression guard,
  `List-Unsubscribe`, template-render — szablony tsx przeniesione do API,
  `@react-email/render` działa na czystym Node; dokłada `react` + wiadomości
  `emails`); `onboarding/` (3 kroki z góry, run-time interrupt
  `hasPaidSubscription`); odpowiednik `GET /api/cron/jobs` (`CRON_SECRET`
  timing-safe, self-enqueue housekeepingu, `{ claimed, succeeded, ... }`);
  `notifications`: handler `notification.create` + `PUT /v1/notification-preferences`;
  `POST /v1/unsubscribe` (RFC 8058, HMAC, zawsze 200).
- Web: route `/api/cron/jobs`, `/api/unsubscribe`, cała reszta mailowa →
  kasacja; strona `/unsubscribe` tylko weryfikuje (fetch); formularz preferencji
  → fetch `PUT`; `features/emails/actions.ts` → kasacja; `kickDrain`/`after()`
  znika (Nest: fire-and-forget drain po response albo sam cron — cron jest
  gwarancją, decyzja w implementacji).
- E2E: `cron-drain`, `emails-retry`, `emails-transactional`,
  `emails-unsubscribe`, `onboarding-sequence`, `i18n-emails`,
  `notifications.spec` (creation) zielone; dev-seamy `emails`,
  `emails/fail-next`, `jobs`, `jobs/run` do API.
- Akceptacja: retry→backoff→dead-letter na symulowanej awarii; opt-out wycisza
  in-app ale nie mail; sekwencja day 0/3/7 z przerwaniem po zakupie; maile PL
  po ustawieniu locale.
- Ryzyka: JSX w Neście (pierwszy raz React poza web — sprawdzić build);
  `getTranslator(locale)` w handlerach (czysty, bez request-scope);
  strefy czasowe `runAt`.

## Faza 2.4 — Storage

Cel: presign/confirm/file + purge w Neście; adapter S3 wędruje za nimi.

- Nest: `storage/` — `POST /v1/storage/presign`, `POST /v1/storage/confirm`,
  `GET/DELETE /v1/storage/files/:id`, handler `storage.purge`
  (object-first-then-row, per-org audit `retention.purge`); adapter S3
  (te same env `S3_*`, `STORAGE_PROVIDER`).
- Web: 3 routy storage → proxy/kasacja; strona `/files` fetchuje;
  `features/storage/*` → kasacja. Uwaga CSP: web liczy `storageOrigin()`
  z `S3_*` do `img-src/connect-src` (direct-to-bucket upload z przeglądarki) —
  `S3_*` ZOSTAJĄ w env weba, choćby tylko do CSP.
- E2E: `storage-isolation` zielone (presign→upload→confirm→read,
  public/private, 422, cross-tenant 404); MinIO w CI bez zmian.
- Akceptacja: pełny cykl upload/odczyt/kasowanie personal+org; purge usuwa
  obiekty i wiersze; `STORAGE_PROVIDER=none` → 404.

## Faza 2.5 — Billing

Cel: checkout/portal/webhook + `billing.notify` w Neście; plany jako pakiet
współdzielony.

- Nowe: `@repo/billing` (wycięte `plans.ts`: `PLAN_IDS`, `PLANS`,
  `planIdForPriceId`, `purchasablePlan`) — landing, checkout i webhook czytają
  z jednego miejsca.
- Nest: `billing/` — `POST /v1/billing/checkout` i `/v1/billing/portal`
  (odpowiedź `{ url }`, NIE redirect; `NOT_CONFIGURED`→404,
  `NO_CUSTOMER`→404); `POST /v1/billing/webhook` (surowe body — Express
  `rawBody: true` włączone w etapie 1; HMAC w adapterze Stripe, który wędruje
  do API); transakcja marker+upsert+`recordAudit` (SYSTEM_ACTOR)+enqueue
  `billing.notify`; watermark `lastEventAt` przeciw starym eventom.
- Web: 3 routy billing → proxy/kasacja; `billing-panel/actions` → fetch +
  `window.location.assign(url)`; landing czyta plany z `@repo/billing`.
  Stripe bije wprost w Nest (URL w dashboardzie Stripe); webowy route webhooka
  umiera.
- E2E: `billing-checkout`, `billing-webhook` (+ billingowe części
  `notifications.spec`, `emails-transactional`, `onboarding-sequence`) zielone;
  dev-seamy `seed-billing-customer`, `billing-state` do API.
- Akceptacja: redirect NIE daje uprawnień (webhook nadaje); retry webhooka
  idempotentny; stary event nie nadpisuje nowszego; checkout bez providera → 404.

## Faza 2.6 — Admin (super-admin)

Cel: panel w Neście; najtrudniejszy kawałek: impersonation przez granicę procesów.

- Nest: `admin/` — `GET /v1/admin/users`, `GET /v1/admin/users/:id`,
  `GET /v1/admin/organizations`, `GET /v1/admin/organizations/:id`,
  `GET /v1/admin/audit` (wszystkie za `SuperAdminGuard` — port
  `requireSuperAdmin`: sesja + `impersonatedBy===null` + `isSuperAdmin`, live
  z DB, nigdy z ciasteczka); mutacje impersonate/stop/suspend/unsuspend/
  delete-user/delete-org/set-role — audyt Rule A (transakcja) / Rule B
  (audit-first, potem silnik) 1:1; reguły `retention.ts` wędrują.
- Impersonation design: przeglądarka gada z webem, sesję trzyma Nest →
  web-routy `POST /api/admin/impersonate` wołają Nest i przeklejają
  `Set-Cookie` z odpowiedzi Nesta do przeglądarki (jedyny taki przypadek).
  Po swapie ŻADEN odczyt sesji po stronie wołającej (stale-cookie, jak dziś).
- Web: strony `(admin)` zostają (render + fetch);
  `features/admin/actions.ts` + `data.ts` → kasacja; `no-restricted-imports`
  dla `adminAuthAdapter` umiera razem z adapterem w web.
- E2E: `admin-access`, `admin-impersonation`, `admin-lifecycle` zielone;
  dev-seam `seed-super-admin` do API.
- Akceptacja: admin→impersonate→banner→403 na /admin pod przebraniem→stop→
  audyt `impersonation.start/stop`; suspend blokuje login; admin nie może
  impersonować admina; ostatni admin nieusuwalny.
- Ryzyka: Set-Cookie przez proxy (test na żywym!); bootstrap pierwszego admina
  SQL bez zmian.

## Faza 2.7 — MCP + OAuth

Cel: agent AI za API; strony mostka OAuth zostają w web.

- Nest: `mcp/` — 4 read-only tools (`list_organizations`, `list_members`,
  `count_unread_notifications`, `list_recent_notifications`) na tych samych
  prymitywach tenantowych; `withMcpAuth` (bearer→userId, 401 z
  `WWW-Authenticate`); plugin MCP w silniku Nesta (tabele `oauth*` już
  w schemacie); odpowiedniki `/.well-known/*`.
- Web: route `/api/mcp` → proxy do Nesta (klienci MCP biją w publiczny URL
  weba — przeklejka z zachowaniem auth-headerów); strony `/oauth/login`,
  `/oauth/consent` ZOSTAJĄ (UI mostka); `features/mcp/*` → kasacja.
- E2E: `mcp.spec` zielone; dev-seam `mcp` do API.
- Akceptacja: pełny flow OAuth (dynamic registration → authorize → consent →
  token → tool call) przeciw Nestowi; denied dla obcego tenantu.

## Faza 2.8 — i18n-locale + proxy.ts finał + brama lint

Cel: web bez DB, bez actions, z proxy wołającym Nest o sesję.

- Nest: `PATCH /v1/locale` (zapis `user.locale`; cookie `app-locale` stawia web
  na odpowiedzi, jak w 2.1).
- Web: `setLocaleAction` → kasacja (fetch do Nesta + cookie w web-roucie);
  `proxy.ts`: check sesji = `fetch Nest GET /v1/session` z forwardem cookies
  (cache per-request; rate-limit counting ZOSTAJE w proxy — licznik brzegowy,
  adapter postgres współdzielony); reszta proxy (locale, nonce/CSP,
  request-id) bez zmian.
- Brama: eslint `no-restricted-imports` — `apps/web` nie importuje `@repo/db`,
  `drizzle-orm`, `postgres` ani `"use server"` (złamanie = błąd); kasacja
  wszystkich shimów `export * from "@repo/..."` w web.
- E2E: `i18n-switch`, `i18n-negotiation`, `protected-redirect`, `rate-limit`,
  `security-headers`, `content-no-js`, `seo-*`, `content-prose` zielone.
- Akceptacja: grep po `from "@repo/db"|from "drizzle-orm"|use server`
  w `apps/web/src` zwraca zero; anonimowy `/dashboard` → login z callbackUrl;
  przełącznik języka stawia cookie i zapisuje w DB.

## Faza 2.9 — zamknięcie etapu 2

- Docs: `ARCHITECTURE.md` + komentarze ścieżek (`src/lib/adapters/...` →
  pakiety/API) — jeden commit `docs:`.
- API deploy: VPS + Docker Compose (zdecydowane) — Dockerfile API
  (`node dist/main`) + usługa `api` w `docker-compose.yml` obok web/postgres;
  web na Vercel dostaje `API_BASE_URL` na publiczny adres API z VPS-a.
- E2E full: cała suita ×2 tryby tenancy zielona; CI: job `api`
  (build/lint/typecheck) + e2e z dwoma serwerami.
- Akceptacja etapu 2: web to czysty frontend; każde zapytanie z danymi
  przechodzi przez Nest; klienci mobilni mają gotowe `@repo/api-client +
contracts`.

## Otwarte decyzje

1. **Deploy API** — zdecydowane: VPS + Docker Compose (patrz faza 2.9).
2. **Sign-in a cookie `app-locale`** (do domknięcia w fazie 2.1): redirect po
   loginie przechodzi przez web-route stawiający cookie, czy klient woła
   `PATCH /v1/locale` po zalogowaniu?

## Szacunek gabarytu

2.1 i 2.6 to duże fazy (auth cookies, impersonation przez proxy); 2.0 i 2.8
to małe; reszta średnie. Razem ~10 commitów (2.0–2.9).
