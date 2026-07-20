# Plan implementacji: langlion (Moduł Grup i Rezerwacji)

**Utworzono:** 2026-07-19
**Podstawa:** `docs/specyfikacja.md` — wersja dokumentu 15 (EPIK 31 obecność, EPIK 32 wynagrodzenia trenerów, EPIK 33 indywidualne ceny klienta), rewizja 14.2 (adresowanie, `class_session`), rewizja 14.1 (encja `client`)
**Specyfikacja fundamentu:** `docs/boilerplate-spec.md` (odwołania „boilerplate §X")
**Dokument siostrzany:** `docs/specyfikacja-cms.md` — moduł Website Builder (Payload CMS). Nie jest objęty fazami tego planu, ale **dzieli z EPIK 4 jedną zależność blokującą: routing subdomenowy** (patrz „Otwarte pytania"). Middleware budowany raz, dla obu modułów — nie dwa równoległe routingi.
**Konwencje kodu:** `docs/ARCHITECTURE.md`

Ten plik jest **jedynym trwałym źródłem prawdy o planie i postępie** między sesjami pracy (Claude Code nie pamięta poprzednich sesji). Zasady pracy: patrz `CLAUDE.md` (sekcja „Zasady pracy nad langlion").

**Legenda statusów:** `nierozpoczęta` / `w toku` / `zakończona`
**⚠️ przy nazwie fazy** = wąska faza wysokiego ryzyka: świadome odejście od wzorca boilerplate'owego albo praca na współdzielonej infrastrukturze. Takich faz nie wolno łączyć z inną pracą.

---

## Rozstrzygnięcia (decyzje podjęte 2026-07-19, wiążące dla wszystkich faz)

1. **Specyfikacja boilerplate'u przywrócona** jako `docs/boilerplate-spec.md` — odwołania „boilerplate §X" w specyfikacji langlion wskazują na ten plik.
2. **Klient (rodzic) = odrębna encja domenowa `client`** — NIE boilerplate'owy User/Membership. Czwarty świadomy wyjątek od reguły reużycia boilerplate'u (obok Notification Center, planów w DB, Stripe Connect). Unikalność `(organization_id, email)`, domenowy OTP scoped per organizacja, osobna sesja. Pełna izolacja: ten sam e-mail w dwóch akademiach = dwa niepowiązane konta. Specyfikacja zaktualizowana (rewizja 14.1: §1.1, §1.2, §2.8, §2.19, US-4.x, decyzja #15 w §7).
3. **Powiadomienia przed fazą Notification Center (F14): wyłącznie e-mail** przez istniejący `enqueueEmail`. F14 dodaje kanał in-app + preferencje i robi retrofit wcześniejszych zdarzeń na katalog `notification_event_type`.
4. **Role personelu: statyczne, predefiniowane** — rozszerzenie mapy w `src/features/rbac/index.ts` o `reception`/`trainer`/`secretariat` + uprawnienia domenowe z §2.10. Mechanizm ról custom w DB (boilerplate §4.3) NIE jest budowany — mapa statyczna pozostaje jedynym źródłem prawdy i pozwala dodać DB-backed role później bez migracji danych.
5. **Postgres RLS na wszystkich tabelach tenantowych** (US-1.1/AC1 traktowane jako twardy wymóg): infrastruktura + polityki na tabelach langlion w Fazie 0, retrofit tabel boilerplate'u jako osobna Faza 1.

### Rozstrzygnięcia podjęte w trakcie Fazy 0 (2026-07-19)

| #   | Decyzja                                                                                                                                   | Uzasadnienie                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Vitest** jako drugi runner obok Playwrighta (`pnpm test`, krok w jobie `quality`)                                                       | Repo nie miało żadnego runnera unit-testów; logika stref czasowych wymaga testu bez bazy i bez `pnpm build`. Podział wymuszony rozszerzeniem: `.test.ts` w `src/` = Vitest, `.spec.ts` w `e2e/` = Playwright                |
| D2  | **Dwa URL-e bazy**: `DATABASE_URL` → rola `saas_school` (NOSUPERUSER, NOBYPASSRLS, nie-właściciel), `DATABASE_MIGRATION_URL` → właściciel | Aplikacja łączyła się jako `postgres` (superuser + właściciel), co czyniłoby RLS dekoracją. Zweryfikowane testem `usesuper=false`/`rolbypassrls=false`                                                                      |
| D3  | Mini-UI (subdomena + strefa + waluta) na `/orgs/new`                                                                                      | Constraint 5 zabrania DEFAULT-u; wariant „stała z TODO" wprowadzałby de facto default                                                                                                                                       |
| D4  | `booking` → `class_session` **złożony FK z `ON UPDATE CASCADE`** na `(id, organizationId, startTime, endTime)`                            | Daje semantykę US-3.4/AC3 strukturalnie zamiast konwencji „pamiętaj o tej samej transakcji". Zweryfikowane: przesunięcie sesji aktualizuje denorm w `booking` bez kodu aplikacyjnego                                        |
| D5  | EXCLUDE na `class_session` z `WHERE "status" <> 'cancelled'`                                                                              | Odejście od dosłownego §5.1. Bez tego odwołana sesja blokuje slot trenera na zawsze — ujawniłoby się dopiero w F7 (US-19.2) i wymagałoby migracji danych                                                                    |
| D6  | Nazwa roli aplikacyjnej: **`saas_school`**                                                                                                | —                                                                                                                                                                                                                           |
| D7  | `DATABASE_MIGRATION_URL` **poza** `src/lib/env/server.ts`, tylko w `drizzle.config.ts` (fail-fast, bez fallbacku)                         | Aplikacja nie powinna móc odczytać poświadczeń właściciela. Cichy fallback objawiłby się jako „permission denied for schema public"                                                                                         |
| D8  | Bypass RLS przez **GUC** `app.bypass_rls` (`withSystemBypass`), nie drugą rolę/pulę; ogrodzony `no-restricted-imports`                    | Druga rola łamie „`src/lib/db/index.ts` to jedyne miejsce otwarcia połączenia". W F0 jedynym konsumentem jest sonda testowa. Ścieżka do drugiej roli udokumentowana jako opcja na F1                                        |
| D9  | `athlete` i `group_type_recurrence` dostają `organizationId` (§1.2 ich nie wymienia)                                                      | Wymusza reguła z nagłówka `schema/index.ts`; polityka RLS bez lokalnej kolumny właściciela kosztowałaby podzapytanie na każdym wierszu                                                                                      |
| D10 | **Identyfikatory dwupoziomowe**: `organization.subdomain` globalnie unikalny (DNS), `group_type.slug` unikalny per organizacja            | Patrz §2.27 specyfikacji (rewizja 14.2)                                                                                                                                                                                     |
| D11 | Encja `session` nazwana w implementacji **`class_session`**                                                                               | Wymuszone kolizją z tabelą Better Auth. Kolizja była cicha (`export *` czyni nazwę niejednoznaczną → moduły ES ją pomijają), a wygenerowana migracja wskazywała FK z `booking` na sesje logowania. Patrz §2.28 specyfikacji |
| D12 | Postgres tego projektu na porcie **5433**, kontenery `saas_school_*`; MinIO na **9100/9101**                                              | Port 5432 i domyślne nazwy zajmuje równolegle działające repo `saas-boilerplate`. Namespace zamiast zatrzymywania cudzego środowiska                                                                                        |
| D13 | GRANT-y dla roli aplikacyjnej w osobnej migracji `0012`, przed tabelami i politykami                                                      | Plan umieszczał je w Kroku 6, co zostawiłoby repo w stanie niedziałającym przez trzy kroki — po utworzeniu roli aplikacja nie mogła odczytać żadnej tabeli                                                                  |

---

## Stan na start (audyt z 2026-07-19)

### Fundament boilerplate — zaimplementowane, reużywamy (nie budujemy)

- **Auth personelu:** Better Auth za adapterem (`src/lib/adapters/auth/` — kontrakt + jedyny plik z SDK); e-mail/hasło, weryfikacja e-mail, reset hasła; `requireSession` (`src/lib/auth/index.ts`); `src/proxy.ts` = default-deny + routing i18n + rate limit + CSP nonce + request-id.
- **Multi-tenancy:** `organization`/`membership`/`personal_account`/`invitation`; chokepoint `requireOrgAccess`/`requireOrgPermission` (`src/features/organizations/context.ts`); wzorzec właściciela `organization_id` XOR `account_id`; `MULTI_TENANCY_MODE` (`src/lib/tenancy.ts`).
- **RBAC:** statyczna mapa rola→uprawnienia w `src/features/rbac/index.ts` (owner/admin/member); egzekwowanie backendowe przez `requireOrgPermission` + `forbidden()` (403).
- **Billing (Platform):** adapter `src/lib/adapters/billing/` (kontrakt, `stripe.ts`, `none.ts`); checkout/portal (`src/features/billing/checkout.ts`, `/api/billing/*`); webhooki z weryfikacją podpisu i idempotencją — tabela `webhook_event`, marker+efekt w jednej transakcji, watermark `lastEventAt` na eventy poza kolejnością (`src/features/billing/webhooks.ts`); subskrypcja XOR org/account; eventy: subscription.created/updated/deleted, invoice.paid/payment_failed, charge.refunded.
- **Storage:** adapter S3-compatible (`src/lib/adapters/storage/`), presigned POST (upload direct-to-bucket) + presigned GET, izolacja prefiksem klucza `org/{id}` / `acct/{id}`, soft delete + job `storage.purge`.
- **Background jobs:** kolejka Postgres (`src/lib/adapters/jobs/postgres.ts`) — transactional outbox (`enqueue(writer, …)` uczestniczy w transakcji wywołującego), `FOR UPDATE SKIP LOCKED`, retry z backoffem+jitterem, dead-letter, `dedupeKey`; drain: `after()` (optymalizacja) + cron `/api/cron/jobs` z `CRON_SECRET` (gwarancja).
- **Audit trail:** `recordAudit(tx, …)` + `changed(before, after, fields)` (field-level from→to) w `src/features/admin/audit.ts`; aktorzy `User`/`System`/`AIAgent`/`Admin` przez `resolveActor`; świadomie call-site w akcjach, nie automatyczny hook DAL; odczyt tenantowy (`organizations/audit-data.ts`) i cross-tenant (`admin/data.ts`).
- **Notyfikacje boilerplate (dla personelu):** `notification`/`notification_preference`, enqueue przez job `notification.create`, polling 15 s (`notification-bell.tsx`).
- **E-mail:** adapter (Resend/log), szablony React Email, `enqueueEmail` jako jedyna ścieżka wysyłki, suppression + unsubscribe, sekwencja onboardingowa day 0/3/7.
- **Pozostałe:** walidacja zod jako nazwana warstwa, i18n next-intl (en/pl), CSP + security headers, rate limiting z tierami, soft delete `deletedAt` (job purge retencji jeszcze niezbudowany), panel super admina + impersonacja z audytem, MCP OAuth server (read-only), suita e2e Playwright + dev-seed endpoints (`/api/dev/*`, 404 w produkcji), CI.

### Braki względem potrzeb langlion — do zbudowania

- **Cały model domenowy langlion** — żadna encja z §1.2 nie istnieje.
- **Magic link / OTP:** brak w boilerplacie. Nieistotne po Rozstrzygnięciu #2 — OTP klienta budujemy domenowo; wzorzec tokenu do skopiowania: `src/lib/db/schema/invitations.ts` (hash SHA-256, TTL, jednorazowość przez status).
- **Role Recepcja/Trener/Sekretariat + uprawnienia domenowe §2.10:** brak (Rozstrzygnięcie #4: statyczna mapa).
- **Postgres RLS:** brak w ogóle — izolacja wyłącznie aplikacyjna (Rozstrzygnięcie #5).
- **Plany/limity:** dziś config `src/features/billing/plans.ts` + env (`STRIPE_PRICE_*`); limity zadeklarowane, ale NIGDZIE nieegzekwowane (jedyny konsument: tabela cen na landing). EPIK 29 buduje model w DB od zera.
- **Stripe Connect:** zero śladów w kodzie (zweryfikowane: brak `stripeAccount`, `account.updated`, `acct_`, `application_fee`). EPIK 30 od zera.
- **Eksport CSV audytu** (boilerplate §6.4): brak — niski priorytet, poza fazami langlion.

---

## Fazy

Kolejność oparta na §5 specyfikacji („Kolejność implementacji"), skorygowana o stan kodu i Rozstrzygnięcia #2/#5. Każda faza jest samodzielnie testowalna i wdrażalna — po jej zamknięciu produkt jest w spójnym stanie.

---

### Faza 0 — Fundament domeny: dokumenty + rdzeń modelu danych + infrastruktura RLS

**Status:** ✅ **zakończona** (2026-07-19)
**Cel:** encje rdzenia z ochroną współbieżności na poziomie bazy i RLS jako drugą linią obrony; uporządkowana dokumentacja. Backend-only (bez UI) — nie zmienia zachowania istniejącego produktu.
**Pokrywa:** spec §5 pkt 1–2; EPIK 1 (US-1.1, US-1.2); Zasady nadrzędne #1–#3 (fundament pod nie); §2.14 (kwoty integer od startu).
**Zależności:** brak (fundament boilerplate istnieje).

**Zadania:** (wszystkie wykonane — szczegóły realizacji w „Raport z realizacji Fazy 0" poniżej)

1. **Dokumenty** _(część wykonana 2026-07-19 przy tworzeniu tego planu)_:
   - [x] `docs/boilerplate-spec.md` — przywrócona specyfikacja boilerplate'u
   - [x] `docs/specyfikacja.md` — rewizja 14.1 (encja `client`)
   - [x] `docs/plan-implementacji.md` — ten plik
   - [x] `CLAUDE.md` — zasady pracy fazami
2. **Migracja A:** `CREATE EXTENSION IF NOT EXISTS btree_gist`; `organization` + kolumny `timezone` (IANA), `currency` (ISO 4217) — backfill istniejących wierszy dev (`Europe/Warsaw`/`PLN`), potem NOT NULL; wymagalność bez domyślnej wartości egzekwowana na poziomie aplikacji przy tworzeniu organizacji (Constraint 5, US-24.1/AC1).
3. **Migracja B — tabele rdzenia** (`src/lib/db/schema/`: `locations.ts`, `group-types.ts`, `group-type-recurrences.ts`, `sessions.ts`, `clients.ts`, `athletes.ts`, `bookings.ts`; re-export w `schema/index.ts`):
   - `location` (organization_id, name, address, soft delete)
   - `group_type` (engine, payment_policy, price **integer**, is_new_client_only, eligible_trainer_ids, default_location_id, allowed_purchase_modes, allowed_billing_types, slug, soft delete; `policy_document_id` dojdzie w F17)
   - `group_type_recurrence` (day_of_week, start_time, duration, trainer_id, capacity, location_id, is_recurring, occurrences_count, start_date)
   - `session` (start/end timestamptz UTC, capacity, location_id, status, generated_from_recurrence_id, **denorm organization_id**, is_manually_adjusted)
   - `client` (unikalność `(organization_id, email)`, phone, name, is_verified) — rewizja 14.1
   - `athlete` (parent_client_id, name, age)
   - `booking` (session_id, athlete_id, payment_status, `price_snapshot` jsonb **z walutą**, consumed_credit_id nullable — FK dojdzie w F4, **denorm session_start_time/end_time**, **denorm organization_id**)
   - **Constrainty (Zasada #3):** §5.1 `EXCLUDE USING gist (trainer_id WITH =, tstzrange(start_time, end_time) WITH &&)` na `session`; §4.4 unique `(generated_from_recurrence_id, start_time)`; §5.3 `EXCLUDE USING gist (athlete_id WITH =, tstzrange(session_start_time, session_end_time) WITH &&) WHERE (payment_status NOT IN ('cancelled'))` na `booking`
4. **Infrastruktura RLS:** dedykowana rola aplikacyjna bez BYPASSRLS (docker-compose + instrukcja w docs), `FORCE ROW LEVEL SECURITY`, wrapper w `src/lib/db` (np. `withTenant(orgId, fn)` → transakcja + `SET LOCAL app.organization_id`), polityki na wszystkich tabelach z pkt 3; jawna, udokumentowana ścieżka bypass dla super admina/jobów/webhooków; opis wzorca w `ARCHITECTURE.md`. (Retrofit tabel boilerplate'u = Faza 1.)
5. **Szkielety modułów:** `src/features/{locations,groups,schedule,clients,bookings}/` — `data.ts` (owner-scoped, wzorzec `src/features/organizations/data.ts`) + `schema.ts` (zod), bez UI.
6. **Testy** (wzorzec: istniejące e2e + dev-seed): constraint trenera odrzuca nakładające się sesje; constraint zawodnika odrzuca nakładające się aktywne rezerwacje; unique generowania jest idempotentny; RLS blokuje odczyt/zapis cross-tenant nawet przy pominięciu filtra aplikacyjnego (US-1.1/AC1); logika stref czasowych — generowanie wokół zmiany czasu marzec/październik daje stałą lokalną godzinę (US-1.2/AC1, test jednostkowy logiki dat).
7. **Zamknięcie fazy:** `pnpm lint` / `pnpm typecheck` / `pnpm test:e2e` zielone (w tym cała istniejąca suita bez regresji); aktualizacja tego pliku (status → zakończona + ewentualne korekty dalszych faz).

**Definicja ukończenia (DoD):** migracje przechodzą od zera (`pnpm db:migrate` na czystej bazie) i na istniejącej bazie dev; wszystkie testy z pkt 6 zielone; istniejąca suita e2e bez regresji; dokumenty z pkt 1 w repo.

#### Raport z realizacji Fazy 0 (2026-07-19) — referencja względem DoD

| Kryterium DoD                                                 | Wynik                                                                                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migracje od zera na czystej bazie                             | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` — przechodzi; init-SQL tworzy rolę na świeżym wolumenie                                                             |
| Migracje na istniejącej bazie dev                             | ✅ trójstopniowy backfill (`ADD` nullable → `UPDATE` → `SET NOT NULL`) zastosowany na niepustej `organization`                                                                   |
| Constraint trenera (§5.1)                                     | ✅ `class_session_trainer_no_overlap_excl` — kolizja `23P01`; sesje przylegające przechodzą (dowód na `'[)'`); sesja `cancelled` zwalnia slot (D5)                               |
| Constraint zawodnika (§5.3)                                   | ✅ `booking_athlete_no_overlap_excl` — kolizja `23P01`; `cancelled` zwalnia termin                                                                                               |
| Idempotencja generowania (§4.4)                               | ✅ `class_session_recurrence_start_uq` — powtórka `23505`; sesje bez wzorca (NULL) nie kolidują                                                                                  |
| RLS blokuje cross-tenant przy pominiętym filtrze (US-1.1/AC1) | ✅ sonda `/api/dev/rls-probe` wykonuje zapytania **bez** `organizationId`: kontekst tenanta → tylko jego wiersze; brak kontekstu → 0 wierszy; zapis do cudzego tenanta → `42501` |
| Środowisko faktycznie egzekwuje RLS                           | ✅ test twardo asertuje `usesuper=false`, `rolbypassrls=false` oraz `relrowsecurity`+`relforcerowsecurity` na wszystkich 7 tabelach — bez tego pozostałe testy RLS byłyby puste  |
| Brak wycieku kontekstu przez pulę połączeń                    | ✅ osobny test: po `withTenant` natychmiastowe zapytanie bez kontekstu zwraca 0 wierszy (łapie `set_config(..., false)`)                                                         |
| Logika stref czasowych (US-1.2/AC1)                           | ✅ 13 testów Vitest: 40 tygodni przez obie zmiany czasu daje stale 17:00 lokalnie; przypięte godziny nieistniejąca/dwuznaczna, strefa +05:30, krok tygodniowy 167 h              |
| Istniejąca suita e2e bez regresji                             | ✅ `136 passed, 3 skipped, 0 failed` (`--workers=1`, konfiguracja CI)                                                                                                            |
| `lint` / `typecheck` / `test` / `format:check`                | ✅ wszystkie zielone                                                                                                                                                             |

**Weryfikacja D4 (denormalizacja czasów):** przesunięcie `class_session.startTime` o godzinę zaktualizowało `booking.sessionStartTime`/`sessionEndTime` przez `ON UPDATE CASCADE`, bez udziału kodu aplikacyjnego — ryzyko „łatwe do pominięcia" z sekcji Ryzyka jest tym samym zdjęte na poziomie schematu, nie konwencji.

**Odstępstwa od pierwotnego planu Fazy 0:**

- GRANT-y dla roli aplikacyjnej wydzielone do migracji `0012`, przed tabelami i politykami (D13) — plan umieszczał je w Kroku 6, co pozostawiłoby repo niedziałające przez trzy kroki.
- Encja `session` → `class_session` (D11) — wymuszone kolizją z Better Auth, wykrytą dzięki temu, że wygenerowana migracja pominęła tabelę, generując FK na tabelę sesji logowania.
- Namespace portów i kontenerów Dockera (D12) — port 5432 zajęty przez równolegle działające repo.
- `organization.subdomain` (D10) — dołożone w trakcie fazy na wniosek użytkownika, wraz z rewizją 14.2 specyfikacji.

**Nowe artefakty:** `vitest.config.ts`; `docker/postgres-init/01-app-role.sql`; `src/lib/db/{tenant,system}.ts`; `src/lib/db/schema/{locations,group-types,group-type-recurrences,class-sessions,clients,athletes,bookings}.ts`; `src/features/{locations,groups,schedule,clients,bookings}/{data,schema}.ts`; `src/features/schedule/recurrence.ts` + test; `src/app/api/dev/{rls-probe,seed-langlion}/`; `e2e/langlion-{rls,constraints}.spec.ts`; migracje `0012`–`0015`.

---

### Faza 1 — ⚠️ RLS retrofit tabel tenantowych boilerplate'u

**Podzielona na F1a i F1b w trakcie planowania (2026-07-19).** Uzasadnienie podziału: eksploracja wykazała blast radius 15 sygnatur DAL-i, ~26 call site'ów i 5 wyjątków ESLint, obejmujący jednocześnie warstwę żądań, panel super admina, joby i webhooki. Jeden commit dotykający tego wszystkiego naraz jest trudny do zdiagnozowania przy czerwonej suicie, a webhooki mają inny profil (właściciela trzeba najpierw rozwiązać) niż ścieżki żądań (kontekst org jest już w `OrgContext`). Podział przebiega dokładnie po tej granicy.

---

### Faza 1a — ⚠️ RLS: membership, invitation, file, notification

**Status:** ✅ **zakończona** (2026-07-19)
**Cel:** druga linia obrony (RLS) na tabelach tenantowych boilerplate'u obsługiwanych ze ścieżki żądania + infrastruktura pod drugi kształt właściciela.
**Pokrywa:** US-1.1/AC1 dla tabel boilerplate'u ze ścieżki żądań; boilerplate §11.2.
**Zależności:** F0 ✅

**Zrealizowany zakres:** typ `Owner` + `withOwner` i drugi GUC `app.account_id` (`withTenant` przepisany jako alias); `cross-tenant.ts` jako ogrodzony moduł dla trzech odczytów bez tenanta; DAL-e organizations/storage/notifications przyjmują `tx: TenantDb`; wąski bypass w `storage/purge.ts`; hardening `notificationJobSchema` (XOR); migracja `0016_rls_boilerplate_tenant.sql`; probe rozszerzony o `mode: "owner"`, `rowOwner` i `EXCLUDED_TABLES`; nowy `e2e/boilerplate-rls.spec.ts` (10 testów).

#### Raport z realizacji Fazy 1a — referencja względem DoD

| Kryterium DoD                                     | Wynik                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Polityki aktywne (`ENABLE`+`FORCE`) na 4 tabelach | ✅ 8 polityk w `pg_policies`, `relrowsecurity`+`relforcerowsecurity` na wszystkich 4                                       |
| Obie gałęzie właściciela działają                 | ✅ test gałęzi kontowej: konto widzi wyłącznie własne pliki, ani cudzego konta, ani organizacji                            |
| Odmowa zapisu cross-owner                         | ✅ `42501` w tej samej gałęzi ORAZ cross-branch (kontekst org nie spełnia gałęzi kontowej)                                 |
| Kontrola pozytywna                                | ✅ zapis dla własnego właściciela przechodzi — bez tego testy odmowy przechodziłyby przy polityce odmawiającej wszystkiego |
| Asercja carve-outu (negatywna)                    | ✅ `organization`, `personal_account`, `notification_preference`, `audit_log` mają `relrowsecurity=false`                  |
| Fail-closed bez kontekstu                         | ✅ `mode:"raw"` na wszystkich 4 tabelach zwraca `[]`                                                                       |
| Brak wycieku kontekstu przez pulę                 | ✅ odczyt w kontekście → natychmiastowy odczyt raw → `[]`                                                                  |
| **Cała istniejąca suita e2e zielona**             | ✅ **146 passed, 3 skipped, 0 failed** (baseline F0: 136+3; +10 nowych testów)                                             |
| `lint` / `typecheck` / `test` / `format`          | ✅ wszystkie zielone                                                                                                       |
| Migracje od zera na czystej bazie                 | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → 8 polityk, 4 tabele FORCE                                   |
| Bramka danych 8.0 (przed migracją)                | ✅ patrz niżej                                                                                                             |

**Wynik bramki danych** (rola właściciela, przed migracją, na bazie dev z realnymi danymi):

| tabela         | wierszy | org-owned | account-owned | **bez właściciela** |
| -------------- | ------- | --------- | ------------- | ------------------- |
| `notification` | 118     | 8         | **110**       | **0**               |
| `file`         | 3       | 3         | 0             | **0**               |
| `membership`   | 70      | 70        | —             | **0**               |
| `invitation`   | 5       | 5         | —             | **0**               |

Bramka nie była pusta, więc jej zero ma treść. Dwie obserwacje warte zapamiętania: **110 ze 118 powiadomień to wiersze kont osobistych** — jednogałęziowa polityka z F0 ukryłaby ~93% tej tabeli, więc drugi GUC nie był decyzją teoretyczną; oraz `file` nie ma w dev ani jednego wiersza account-owned, dlatego test gałęzi kontowej seeduje własny wiersz zamiast polegać na zastanych danych.

#### Rozstrzygnięcia podjęte w Fazie 1a

| #   | Decyzja                                                                                  | Uzasadnienie                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D14 | **Drugi GUC `app.account_id` + `withOwner`**; polityka dwugałęziowa na tabelach XOR      | Tabele XOR mają wiersze `organizationId IS NULL`; polityka z F0 ukryłaby je przed ich własnymi właścicielami (110/118 powiadomień w dev)                                                                                                            |
| D15 | `withOwner` **zawsze zapisuje oba GUC-i**, blankując nieaktywny                          | Zagnieżdżenie otwiera SAVEPOINT, nie nową transakcję, a `set_config(…, true)` przeżywa jego zwolnienie — inaczej transakcja spełniałaby oba człony polityki naraz                                                                                   |
| D16 | `requireOrgAccess` przez `withTenant`, **nie** przez bypass                              | Najgorętsza ścieżka aplikacji; `warn` na żądanie zagłuszyłby log, którego celem jest policzalność dziur, i uczyniłby fence dekoracją. GUC pochodzi ze sluga (`organization` poza RLS), więc nie ma cyklu — a nazwanie tenanta nie jest uprawnieniem |
| D17 | `personal_account` i `organization` poza RLS **jako reguła**, nie dwa wyjątki            | Polityki kluczowanej po właścicielu nie da się nałożyć na wiersz definiujący właściciela — zapytanie rozwiązujące jest zapytaniem produkującym wartość GUC                                                                                          |
| D18 | `notification_preference` poza RLS jako **odnotowane odstępstwo** (nie czysty carve-out) | Druga połowa reguły z `schema/index.ts` nie zachodzi (granicą jest sesja). Trzeci GUC odrzucony: rozerwałby `isInAppSuppressed` + zapis na dwie transakcje. Pilnowane **testem negatywnym**                                                         |
| D19 | Wąski bypass: obejmuje wyłącznie zapytanie rozwiązujące właściciela                      | Zapisy (`acceptInvitation`, `storage.purge`) biegną już przez `withOwner`, więc `WITH CHECK` pozostaje load-bearing tam, gdzie pomyłka tenanta niszczy dane                                                                                         |
| D20 | `cross-tenant.ts` jako **osobny plik**, nie wyjątek na `organizations/data.ts`           | Wyjątek na cały `data.ts` dałby bypass funkcjom `getMembership`/`listMembers` — dokładnie tym, które fence ma ograniczać                                                                                                                            |
| D21 | `createOrganizationAction` i `seed-org` **mintują `organizationId` jawnie**              | GUC musi być ustawiony przy otwarciu transakcji, a `.returning()` daje id o jedno stanowienie za późno. Przy okazji znika round-trip                                                                                                                |
| D22 | Seeder `seed-org` używa `withTenant`, nie bypassu                                        | Seeder idący ścieżką, której produkcja nigdy nie używa, przestaje być dowodem, że ścieżka produkcyjna działa                                                                                                                                        |

---

### Faza 1b — ⚠️ RLS: tabele billingowe

**Status:** ✅ **zakończona** (2026-07-19)
**Cel:** domknięcie retrofitu na `billing_customer`, `subscription`, `billing_payment`, `webhook_event`.
**Zależności:** F1a ✅ — odziedziczyła całą infrastrukturę. **Zero nowych GUC-ów, zero nowej infrastruktury.**

**Zrealizowany zakres:** cztery bloki polityk XOR w `0017_rls_billing.sql` (8 polityk, wszystkie 4 tabele `ENABLE`+`FORCE`) przepisane z `0016`; `tx: TenantDb` w siedmiu funkcjach `billing/data.ts`; `findBillingCustomer` wyprowadzone do nowego, ogrodzonego `features/billing/cross-tenant.ts` (jedyny bypass); zapisy webhooka przez `withOwner(ownerOf(customer))`; `BillingOwner` jako alias kanonicznego `Owner`; `notifySchema` hartowany do XOR; dwa konteksty właściciela w `checkout.ts` (wywołanie Stripe pomiędzy); `withOwner` w seederze i `withTenant` (sekwencyjnie) w `billing-state`; probe rozszerzony o cztery tabele i **nową akcję `upsert`**; osiem nowych testów w `boilerplate-rls.spec.ts`.

**Wykonano w dwóch commitach**, celowo: commit A (sam kod, bez migracji) musiał odtworzyć baseline F1a **dokładnie**, przy nieistniejących politykach — to jedyny moment, w którym błąd refaktoru da się odróżnić od wyniku izolacji. Odtworzył (146/3/0).

#### Raport z realizacji Fazy 1b — referencja względem DoD

| Kryterium DoD                                        | Wynik                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Polityki aktywne na 4 tabelach billingowych          | ✅ 8 polityk w `pg_policies`, `relrowsecurity`+`relforcerowsecurity` na wszystkich 4                                                         |
| Webhook: rozwiązanie właściciela pod wąskim bypassem | ✅ `findBillingCustomer` w `cross-tenant.ts`; log `rls bypass` z powodem raz na event                                                        |
| Webhook: zapisy w kontekście właściciela             | ✅ `withOwner(ownerOf(customer))`; `webhooks.ts` **nie** jest zwolniony z fence'a — zweryfikowane próbą (lint faktycznie pada przy imporcie) |
| **`billing-webhook.spec.ts` (główny kanarek)**       | ✅ **8/8** — sygnatury, trójka idempotencji z równoległą parą, watermark, unknown-customer                                                   |
| Bramka danych 8.0                                    | ✅ trzy kwerendy, rolą właściciela przed migracją — patrz niżej                                                                              |
| Obie gałęzie właściciela                             | ✅ test gałęzi kontowej seeduje własny wiersz (dev nie miał ani jednego account-owned)                                                       |
| Odmowa zapisu cross-owner + kontrola pozytywna       | ✅ `42501` przy cudzym właścicielu, sukces przy własnym                                                                                      |
| Fail-closed bez kontekstu                            | ✅ `mode:"raw"` na wszystkich 4 zwraca `[]`                                                                                                  |
| **Cała suita e2e**                                   | ✅ **154 passed, 3 skipped, 0 failed** (baseline F1a 146+3; +8 nowych)                                                                       |
| Migracje od zera                                     | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → 8 polityk, 4 tabele FORCE                                                     |
| `lint` / `typecheck` / `test` / `format:check`       | ✅ wszystkie zielone                                                                                                                         |

**Wynik bramki danych** (rola właściciela, przed migracją):

| tabela             | wierszy | org-owned | account-owned | **bez właściciela** |
| ------------------ | ------- | --------- | ------------- | ------------------- |
| `billing_customer` | 30      | 30        | 0             | **0**               |
| `subscription`     | 14      | 14        | 0             | **0**               |
| `billing_payment`  | 8       | 8         | 0             | **0**               |
| `webhook_event`    | 26      | 26        | 0             | **0**               |

Wszystkie cztery `*_owner_ck` obecne i `convalidated=true`, więc te zera są **dowiedzione**, nie tylko zaobserwowane. Trzecia kwerenda (zgodność właściciela `subscription`/`billing_payment` z ich `billing_customer`) — **0 wierszy rozbieżnych**; to ona miała tu treść, bo żaden constraint jej nie pilnuje. Odwrotnie niż w F1a: **zero wierszy account-owned we wszystkich czterech tabelach**, dlatego testy gałęzi kontowej seedują własne dane zamiast ufać zastanym.

#### Rozstrzygnięcia podjęte w Fazie 1b

| #   | Decyzja                                                                                               | Uzasadnienie                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D23 | Bypass w **`billing/cross-tenant.ts`**, nie w `webhooks.ts` — **odstępstwo od linii Zakres tej fazy** | D20 zastosowane dosłownie: zwolnienie `webhooks.ts` postawiłoby furtkę w tym samym pliku co `applySubscriptionEvent`/`applyPaymentEvent`, których `WITH CHECK` jest ostatnią linią obrony na jedynej zewnętrznie sterowanej ścieżce zapisu. `webhooks.ts` trafił na listę NOT-EXEMPT |
| D24 | `getSubscriptionByProviderId` pod `withOwner`, **bez bypassu** — **odstępstwo od linii Zakres**       | `notifySchema` już niósł `organizationId`/`accountId` w obu wariantach. Odczyt staje się owner-scoped — wzmocnienie, nie kompromis. Schemat hartowany do XOR (precedens `notificationJobSchema`)                                                                                     |
| D25 | Bramka 8.0 rozszerzona o **kwerendę zgodności właściciela** i o walidację `*_owner_ck`                | Zmierzone: `ON CONFLICT DO UPDATE` na wiersz niewidoczny pod USING rzuca `42501`. Rozbieżność właściciela = wieczna pętla retry providera. Kolumna „bez właściciela" jest pusta z definicji (XOR CHECK inline), więc sama w sobie nie niosła treści                                  |
| D26 | `setWhere` ewaluowany **przed** sprawdzeniem USING                                                    | Zmierzone. Sygnał „stale" (`applied.length === 0`) jest przez RLS nietknięty — ale rozbieżność właściciela na stale evencie jest połykana po cichu, więc `42501` nie jest detektorem tego stanu; jest nim wyłącznie bramka przedmigracyjna                                           |
| D27 | `checkout.ts`: **dwa** konteksty właściciela, nie jeden obejmujący wywołanie Stripe                   | Jedno opakowanie trzymałoby połączenie z puli przez latencję providera — deadlock dokumentowany w nagłówkach `admin/audit.ts` i `webhooks.ts`. Nie „upraszczać" z powrotem do jednego                                                                                                |
| D28 | `billing-state`: `withTenant` + **sekwencyjnie**, koniec `Promise.all`                                | Trzy równoległe kwerendy na jednym połączeniu transakcji nie są bezpieczne; poprzednia forma działała tylko dlatego, że każda funkcja brała własne połączenie                                                                                                                        |

---

### Faza 2 — Schedule-First: definicje, wzorce, generowanie sezonu (panel akademii)

**Status:** ✅ **zakończona** (2026-07-20)
**Cel:** admin akademii tworzy lokalizacje, typy grup i wzorce; zapis wzorca cyklicznego generuje sezon; edycja wzorca w sezonie działa bezpiecznie.
**Pokrywa:** EPIK 2, 3, 22 (część administracyjna); §2.1 (silnik Schedule-First), §2.2, §2.12; §2.10 (role i uprawnienia domenowe — pierwsza partia).
**Zależności:** F0 ✅ (tabele, constrainty §5.1/§5.3/§4.4, `withTenant`, szkielety `features/{locations,groups,schedule}`, oraz `features/schedule/recurrence.ts` — przetestowana ekspansja wzorca tygodniowego na instanty UTC, gotowa do wpięcia w job generowania sezonu).
**Uwaga wdrożeniowa:** handler joba `sessions.generate` biegnie PO transakcji, która go zakolejkowała, więc musi otworzyć własny kontekst przez `withTenant(payload.organizationId, …)`. Zapomniany kontekst nie rzuca błędu — job zobaczy zero wierszy i uzna, że nie ma pracy.
**Zakres:** rozszerzenie mapy RBAC o role `reception`/`trainer`/`secretariat` i uprawnienia `group_types.manage`, `sessions.generate_season`, `sessions.manage`, `locations.manage` (Rozstrzygnięcie #4); UI CRUD w `/orgs/[slug]/…` za `requireOrgPermission`; job `sessions.generate` (idempotentny przez unique §4.4, dogenerowuje wyłącznie brakujące); edycja wzorca w sezonie: UPDATE przyszłych nieodbytych sesji z `SELECT … FOR UPDATE` per sesja, pominięcie `is_manually_adjusted`, aktualizacja denorm czasów w `booking` w tej samej tx, lista pominiętych z powodem (US-3.4 AC1–AC10; powiadomienia klientów = e-mail, Rozstrzygnięcie #3); grafik/lista sesji z filtrem lokalizacji; konflikt trenera przy generowaniu/edycji = twarda blokada (Force Override dopiero F18); audyt zmian przez `recordAudit`.
**Zakres dołożony w v15:** kolumna `group_type.description` (text, nullable) — migracja additive, walidacja w zod-schemacie `features/groups`, pole w formularzu CRUD typu grupy. Czysto prezentacyjna: renderowanie na publicznej stronie oferty należy do EPIK 4, nie do tej fazy (US-2.1/AC4).
**DoD:** e2e: pełny przepływ admina (lokalizacja → typ → wzorzec → sezon w tle → przedłużenie bez duplikatów → edycja godziny/lokalizacji w sezonie z pominięciem ręcznie skorygowanej sesji); AC z US-2.x (w tym AC4 — `description` zapisuje się i wraca w edycji), US-3.x, US-22.1–22.4 (część admin) pokryte; suita zielona.

**Zrealizowany zakres:** cztery uprawnienia domenowe + trzy role personelu w statycznej mapie RBAC (role zapraszalne przez rozszerzone `invitableRole`/`assignableRole`, oba selecty ról sterowane enumem zamiast list ręcznych); migracja `0018` (`group_type.description`); `features/schedule/generate.ts` — jedna funkcja ekspansji dzielona przez ścieżkę synchroniczną i job `sessions.generate`; akcje `features/{locations,groups,schedule}/actions.ts`; cztery strony w `/orgs/[slug]/{locations,group-types,group-types/[id],schedule}` + formularze klienckie; `listUpcomingSessions` i `listRecurrencesWithDetails` (joiny, nie N+1); prymitywy `Textarea` i `FormField hint`; `sqlStateOf` przeniesione do `lib/db/sql-error.ts` (ma teraz konsumentów produkcyjnych); dev-route `/api/dev/langlion-state`; `e2e/langlion-schedule.spec.ts` (11 testów).

#### Raport z realizacji Fazy 2 — referencja względem DoD

| Kryterium DoD                                       | Wynik                                                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pełny przepływ admina przez UI                      | ✅ lokalizacja → typ grupy → wzorzec → sezon w tle → przedłużenie → przesunięcie w sezonie, wszystko klikane w realnych formularzach                            |
| US-2.1/AC4 (`description`)                          | ✅ zapisuje się i **wraca w formularzu edycji**; markdown z nową linią round-trip'uje (patrz D31)                                                               |
| US-2.1/AC1 (cena wymagana)                          | ✅ zapis bez ceny nie tworzy wiersza                                                                                                                            |
| US-2.2 (nieretroaktywność Definicji)                | ✅ podniesienie `price` z 12000 na 99900 nie ruszyło ani `capacity`, ani `startTime` 4 wygenerowanych sesji                                                     |
| US-3.1/AC1 (sezon jako efekt zapisu)                | ✅ 30 sesji po zapisie wzorca; test asertuje **brak** przycisku „Generuj" — nieobecność kontrolki jest tu kryterium                                             |
| US-1.2/AC1 w realnym sezonie                        | ✅ każda z 30 sesji `Europe/Warsaw` ma lokalnie 17:00 **i poniedziałek**, mimo przejścia przez obie zmiany czasu                                                |
| US-3.1/AC2 (jednorazowy, synchronicznie)            | ✅ sesja istnieje **bez** drenażu kolejki — to właśnie odróżnia tę ścieżkę od jobowej                                                                           |
| US-3.2/AC1 (przedłużenie 4→6)                       | ✅ 6 sesji, a **identyfikatory pierwszych czterech niezmienione** (nie recreate)                                                                                |
| US-3.2/AC2 (idempotencja)                           | ✅ ponowny zapis wzorca → nadal 5 sesji, ten sam zbiór id                                                                                                       |
| US-3.4/AC1+AC8 (przesunięcie z pominięciem ręcznej) | ✅ Czwartek 17:00 → Piątek 19:00: reszta sezonu ma nowy **dzień i godzinę**, sesja z `is_manually_adjusted` zachowała swój instant i flagę                      |
| US-3.4/AC9 (flaga z ręcznej korekty)                | ✅ ustawiana przez realny formularz na grafiku, nie przez fixture                                                                                               |
| US-22.4 (lokalizacja wzorca w sezonie)              | ✅ Hall A → Hall B na wszystkich przyszłych sesjach                                                                                                             |
| §4.2 (backend jest granicą)                         | ✅ `member` dostaje 403 na wszystkich trzech stronach; `trainer` dostaje 403 na typach grup, ale 200 na przeglądzie organizacji (rola istnieje, uprawnień brak) |
| Migracje od zera                                    | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → **19/19** zastosowanych, kolumna obecna                                                          |
| **Cała suita e2e**                                  | ✅ **165 passed, 3 skipped, 0 failed** na czystej bazie (baseline F1b 154+3; +11 nowych)                                                                        |
| `lint` / `typecheck` / `test` / `format:check`      | ✅ wszystkie zielone (Vitest 13/13 bez zmian)                                                                                                                   |

#### Rozstrzygnięcia podjęte w Fazie 2

| #   | Decyzja                                                                                                          | Uzasadnienie                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D29 | **Role personelu wchodzą wcześniej niż ich uprawnienia**; w F2 mają tylko to, co `member`                        | `membership.role` to kolumna tekstowa, a rola spoza mapy nie przechodzi `isRole` → 403 na **całą** organizację. Nazwa bez uprawnień to jeden odmówiony przycisk; uprawnienie bez nazwy to zablokowany człowiek. Grantów pilnują fazy z call site'ami (F6/F12/F15)                         |
| D30 | **Edycja wzorca przelicza pozostały sezon z `generateOccurrences`**, nie przesuwa istniejących instantów o deltę | Bez tego zmiana **dnia tygodnia** jest niewyrażalna (US-3.4/AC1 mówi „dzień/godzina"), a delta w milisekundach łamie DST dla połowy sezonu. Sesja z `is_manually_adjusted` **konsumuje swój slot** zamiast być pomijana — inaczej ochrona jednej sesji przesuwałaby całą resztę o tydzień |
| D31 | Normalizacja CRLF→LF dla `group_type.description` w warstwie zod                                                 | HTML wysyła treść `textarea` z CRLF, więc zapisany tekst nie round-trip'ował tego, co wpisał autor. Niewidoczne na ekranie, rozjeżdżałoby każdy późniejszy diff/hash/render markdown. Wykryte testem AC4, nie recenzją                                                                    |
| D32 | Per-wystąpienie **SAVEPOINT** (`tx.transaction`), nie osobna transakcja na sesję                                 | Daje „pomiń to jedno wystąpienie" na jednym połączeniu z puli. Bez savepointu pierwszy `23P01` zatruwa transakcję i każde kolejne zapytanie pada `25P02` — jedna kolizja wyglądałaby jak awaria całości                                                                                   |
| D33 | Konflikt trenera (`23P01`) rozróżniany od kolizji zawodnika **po nazwie constraintu**                            | Jedyne miejsce w repo czytające nazwę constraintu, świadomie: oba dają ten sam SQLSTATE, a dla admina znaczą co innego („zmień trenera" vs „przenieś rezerwację"). Sam SQLSTATE nie niesie tej informacji                                                                                 |
| D34 | `sqlStateOf` przeniesione z `api/dev/` do **`lib/db/sql-error.ts`**, stary plik zostaje aliasem                  | Zyskało konsumentów produkcyjnych (generowanie sezonu, edycja wzorca). Druga kopia, która inaczej schodziłaby po łańcuchu `cause`, rozjechałaby testy z kodem, który mają pilnować                                                                                                        |
| D35 | E2E asertuje **dwoma warstwami**: UI + `/api/dev/langlion-state`                                                 | Poprawność sezonu żyje w instantach, flagach i pochodzeniu — tabela nie wyraża ich dość precyzyjnie. Sam odczyt stanu przeszedłby zaś na UI, którego nie da się obsłużyć                                                                                                                  |
| D36 | E-mail w etykiecie opcji trenera (`Imię (email)`)                                                                | Dwie trenerki o tym samym imieniu to normalna sytuacja w akademii; picker renderujący je identycznie czyni przypisanie złej osoby do całego sezonu pomyłką bez objawów. Ujawnione przez testy (wszyscy użytkownicy e2e to „E2E User")                                                     |

---

### Faza 3 — ⚠️ Tożsamość klienta: encja client + OTP + sesja klienta (odejście #2)

**Status:** ✅ **zakończona** (2026-07-20)
**Cel:** klient istnieje jako domenowa tożsamość per akademia i umie się uwierzytelnić kodem OTP.
**Pokrywa:** EPIK 4 (US-4.2, US-4.5), §2.8, §2.19 (rewizja 14.1).
**Zależności:** F0 (tabela `client` istnieje).
**Zakres:** tabela tokenów OTP (hash, TTL ~15 min, jednorazowość, scoped `(organization_id, email)` — wzorzec `invitations.ts`); wysyłka kodu przez `enqueueEmail` (nowy szablon); rate limit na wydawanie/weryfikację OTP (istniejący adapter rate-limit); **sesja klienta: opaque token w DB + cookie, TTL 30 dni przedłużany** (rozstrzygnięte 2026-07-20, D37); publiczny layout kliencki (poza `(app)`, w `public-routes`); rozpoznanie zweryfikowanego klienta wyłącznie w obrębie organizacji (§2.8); upsert `client` + `is_verified` flip po OTP.

**Rozstrzygnięcie D37 (start F3) — mechanizm sesji klienta:** tabela `client_session` (hash tokenu, `organization_id`, `client_id`, `expires_at`, `last_used_at`), cookie przenosi wyłącznie losowy token. Odrzucone: podpisane cookie bezstanowe (brak wylogowania i unieważnienia server-side) oraz reużycie Better Auth (rewizja 14.1 wprost wyklucza boilerplate'owy User dla klientów). **Powód wyboru stanu w DB zamiast hosta:** spec §2.19 opiera izolację na cookie scoped per host, ale middleware subdomenowy jeszcze nie istnieje — do jego powstania wszystkie organizacje dzielą host (`localhost`, `/orgs/[slug]`), więc izolacja per organizacja musi być wymuszona w bazie (`organization_id` na wierszu sesji + RLS), nie przez zasięg cookie. Ten sam mechanizm pozostaje poprawny po migracji na subdomeny — cookie scoped per host staje się wtedy drugą, niezależną warstwą, nie warunkiem poprawności. TTL 30 dni z odświeżaniem przy aktywności: rodzic wraca do panelu rzadko (dopisanie terminu, nowy sezon), a krótsza sesja oznaczałaby OTP przy niemal każdej wizycie.
**Rozstrzygnięcie D38 (start F3) — konsumpcja OTP jest atomowa, nie „transakcyjna":** jednorazowość kodu egzekwuje warunkowy `UPDATE client_otp SET consumed_at = now() WHERE id = ? AND consumed_at IS NULL RETURNING id` — brak zwróconego wiersza oznacza kod już zużyty i przerywa ścieżkę **przed** utworzeniem sesji. Sama transakcja tego nie daje: dwie równoległe transakcje mogą odczytać `consumed_at IS NULL`, zanim którakolwiek zacommituje, i obie utworzyć sesję. To ten sam typ luki, przed którym chroni `FOR UPDATE SKIP LOCKED` przy konsumpcji kredytów (F4) i `FOR UPDATE` przy pojemności sesji (§5.2) — spójnie z Zasadą nadrzędną #3 ochrona siedzi w bazie, nie w kolejności kroków aplikacji.

**Zakres backendu jest kompletny w F3, mimo braku UI:** endpoint wydawania OTP robi upsert `client` (`is_verified=false`) dla dowolnego wpisanego e-maila — to docelowe zachowanie produkcyjne wprost z §US-4.1 (formularz tworzy klienta przez upsert **przed** weryfikacją), nie stan tymczasowy na czas fazy. Do późniejszych faz odłożona jest wyłącznie **warstwa prezentacji** (formularz rejestracji i ekran logowania klienta → F5, razem z middlewarem subdomenowym; portfel kredytów → F13). Żadna logika backendu z F3 nie jest zaślepką do przepisania.

**DoD:** e2e: nowy e-mail dostaje OTP i po weryfikacji ma sesję kliencką w akademii A, a ten sam e-mail w akademii B jest obcy (pełna izolacja); kod jednorazowy i wygasający; **dwa równoległe żądania weryfikacji tego samego kodu → powstaje dokładnie jedna sesja, drugie dostaje „kod już zużyty" (D38)**; rate limit działa; wylogowanie unieważnia sesję server-side; suita zielona. Backend F3 jest kompletny sam w sobie — brak UI nie jest luką w DoD.

**Zrealizowany zakres:** migracja `0019` (tabele `client_otp`, `client_session` — obie z złożonym FK na `client (id, organizationId)`, więc sesja/kod z niezgodną organizacją jest nie do zapisania) + ręczna `0020_rls_client_auth` (polityki izolacji i bypass, `FORCE` na obu tabelach); `features/client-auth/` w siedmiu plikach (`config`, `schema`, `data`, `otp`, `session`, `rate-limit`, `organization`); szablon e-mail `client-otp` (+ `pl`/`en`, kategoria `transactional`); cztery trasy produkcyjne `/api/client-auth/{request-code,verify,logout,session}` plus wyjątek w `isPublicApiPath` w `src/proxy.ts`; dev-route `/api/dev/client-auth` (stan + postarzanie kodów); `e2e/client-auth-fixtures.ts` i `e2e/langlion-client-auth.spec.ts` (10 testów); sekcja „Two session mechanisms: staff and parents" w `ARCHITECTURE.md`.

#### Raport z realizacji Fazy 3 — referencja względem DoD

| Kryterium DoD                                  | Wynik                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nowy e-mail → OTP → sesja w akademii A         | ✅ pełna ścieżka przez realne trasy: brak `client` przed → upsert z `is_verified=false` → redempcja → `is_verified=true` i 1 żywa sesja                                         |
| Ten sam e-mail w akademii B jest obcy          | ✅ zapytanie o kod w A **nie tworzy niczego** w B; kod z A dostaje 401 w B, a zaraz potem **nadal działa w A**; sesja z A daje `null` w B                                       |
| US-4.1 (upsert przed weryfikacją)              | ✅ asertowane jako zachowanie produkcyjne, nie efekt uboczny — `clientId` istnieje po wydaniu kodu, `isVerified=false`                                                          |
| Kod jednorazowy                                | ✅ druga redempcja 401, liczba sesji nadal 1 (odmowa, nie druga sesja obok)                                                                                                     |
| Kod wygasający                                 | ✅ przez postarzenie wiersza (`expire-codes`), nie przez `sleep` 15 minut                                                                                                       |
| Supersede przy ponownym wydaniu                | ✅ resend zabija poprzedni kod: `codes.live=1`, stary 401, nowy 200 — resend nie poszerza zbioru działających kodów                                                             |
| **D38 — dwa równoległe żądania**               | ✅ statusy `[200, 401]` i **dokładnie 1 sesja**. Test zweryfikowany mutantem: podmiana `consumeOtp` na SELECT-then-UPDATE daje `[200, 200]` i 2 sesje → test faktycznie ma zęby |
| Cap prób na wierszu (`attempts`)               | ✅ 5 błędnych prób pali kod (`codes.live=0`), po czym **prawidłowy kod też jest martwy** — zamierzony koszt capa                                                                |
| Rate limit                                     | ✅ 6. żądanie kodu dla tego samego adresu → 429 z dodatnim `Retry-After`; suita biegnie na **produkcyjnych** wartościach, izolacja przez bucket per test                        |
| Wylogowanie unieważnia server-side             | ✅ po `logout` sesja `null` **i** `liveSessions=0` — skopiowany token jest martwy, nie tylko nieobecny w tej przeglądarce                                                       |
| Kształt błędów                                 | ✅ nieznana akademia 404, zły kształt kodu i brakujące pole 400                                                                                                                 |
| Migracje od zera                               | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → **21/21**, 4 polityki, `FORCE` na obu tabelach                                                                   |
| **Cała suita e2e**                             | ✅ **175 passed, 3 skipped, 0 failed** na czystej bazie (baseline F2: 165+3; +10 nowych)                                                                                        |
| `lint` / `typecheck` / `test` / `format:check` | ✅ wszystkie zielone (Vitest 13/13 bez zmian)                                                                                                                                   |

#### Rozstrzygnięcia podjęte w Fazie 3

| #   | Decyzja                                                                                | Uzasadnienie                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D39 | **Subdomena jako parametr żądania**, nie `organizationId`                              | To ten sam string, który po F5 przyniesie nagłówek `Host` — więc middleware zmieni tylko **skąd** wartość pochodzi, a nie co dzieje się dalej. Trasa przyjmująca `organizationId` wymagałaby przepisania, a klienci nauczyliby się podawać identyfikator wewnętrzny                 |
| D40 | **Jedna nazwa cookie**, organizacja na wierszu — nie cookie per organizacja            | Kontrakt cookie jest identyczny przed i po F5, gdzie zasięg per host dochodzi sam z siebie. Koszt do tego czasu: jedna przeglądarka trzyma jedną akademię naraz — wrinkle dev/E2E, nie dziura w izolacji, bo token i tak rozwiązuje się w kontekście serwowanego tenanta            |
| D41 | **Cap prób na wierszu** (`client_otp.attempts`) obok rate limitu                       | Adapter rate-limit **fail-open** przy awarii store'u. Dla formularza hasła to słuszne (pod spodem stoi argon2), dla sześciu cyfr — nie, bo pod spodem nie ma nic. Cap w samym UPDATE nie da się podnieść awarią infrastruktury                                                      |
| D42 | `consumedAt` **oznacza jednocześnie „zużyty" i „zastąpiony"**, bez drugiej kolumny     | Ścieżka redempcji nie potrafi ich rozróżnić i nie powinna — odpowiedź dla wywołującego jest w obu wypadkach ta sama („ten kod już nie działa"). Druga kolumna rozbiłaby jeden stan na dwa identyczne w zachowaniu wszędzie poza raportem, o który nikt nie prosił                   |
| D43 | Kod **w temacie** e-maila; brak przycisku i `FallbackLink` — jedyny taki szablon       | Magic link uwierzytelnia każdego, kto otworzy skrzynkę, a skrzynka rodzica bywa współdzielona i przekazywana dalej; kod trzeba przepisać do karty, która o niego poprosiła. Temat z kodem czyta się z powiadomienia na telefonie, bez otwierania klienta poczty                     |
| D44 | Sesję tworzy **trasa**, nie `verifyOtp`                                                | `cookies().set` jest legalne wyłącznie w Route Handlerze/Server Function. Trzymanie tego ograniczenia na brzegu zostawia `verifyOtp` wywoływalnym z joba, testu i przyszłej server action z F5                                                                                      |
| D45 | E2E czyta kod **z outboxu e-mail**, nigdy z fixture'a                                  | W bazie jest wyłącznie SHA-256, więc żaden endpoint nie mógłby zwrócić cyfr — a gdyby mógł, testy przestałyby dowodzić, że rodzic w ogóle **dostaje** kod. Odczyt z outboxu przechodzi przez render szablonu, kolejkę i drain                                                       |
| D46 | Ponowne wystąpienie pułapki z F2: `0019` dostało `when` **mniejsze** niż ręczne `0018` | Reguła z Fazy 2 zadziałała dokładnie tak, jak zapisana — migracja zostałaby cicho pominięta przy zielonym `db:migrate`. Wykryte przez sprawdzenie journala **przed** uruchomieniem, nie przez błąd runtime. Regułę zostawiamy w Ryzykach: przy historii z ręcznymi migracjami wraca |

---

### Faza 4 — System kredytowy (silnik)

**Status:** ✅ **zakończona** (2026-07-20)
**Cel:** kredyt jako jedyna waluta rozliczeniowa (Zasada #2) — silnik bez UI klienckiego.
**Pokrywa:** EPIK 7 (US-7.1–7.4), §2.4; EPIK 20 częściowo (soft delete `credit_type`).
**Zależności:** F0, F2 (`group_type` dla `credit_type.group_type_id` 1:1).
**Zakres:** tabele `credit_type` (1:1 z group_type), `credit` (statusy, source, valid_until liczony w `organization.timezone`, athlete_id nullable = portfel rodzinny, FK źródeł) + FK `booking.consumed_credit_id`; konsumpcja FIFO atomowa (`SELECT … FOR UPDATE SKIP LOCKED`, filtr `status='available'`, priorytet dopasowania konkretnego dziecka przed rodzinnym) w jednej transakcji z bookingiem; `manual_admin_grant` z wymaganym powodem + `recordAudit` (uprawnienie `credits.manual_grant`); cron wygaszania (`expired`) po `valid_until`; RLS na nowych tabelach.
**DoD:** testy: FIFO wybiera najwcześniej wygasający; równoległa konsumpcja ostatniego kredytu — wygrywa jedna transakcja (US-7.2); grant bez powodu odrzucony + wpis audytu przy sukcesie; wygasanie w strefie organizacji; suita zielona.

**Zrealizowany zakres:** migracja `0021` (tabele `credit_type`, `credit` — złożone FK na `(id, organizationId)` klienta, typu, zawodnika i bookingu, więc kredyt z niezgodną organizacją jest nie do zapisania) + ręczna `0022_rls_credits` (4 polityki, `FORCE` na obu tabelach, plus FK `booking_consumed_credit_fk` — patrz D48); `features/credits/` w siedmiu plikach (`validity` + test, `schema`, `issue`, `consume`, `data`, `expire`, `actions`) i komponent `grant-credits-form`; uprawnienie `credits.manual_grant` w statycznej mapie RBAC; job `credits.expire` (kontrakt + rejestr + dzienny enqueue w `/api/cron/jobs`); akcja audytowa `credit.grant` i `AuditTargetType: "client"`; strona `/orgs/[slug]/credits` (D49); `listClients` w `features/clients/data.ts`; dev-route `/api/dev/credits`; `e2e/credits-fixtures.ts` i `e2e/langlion-credits.spec.ts` (9 testów); 8 nowych testów Vitest w `validity.test.ts`.

#### Raport z realizacji Fazy 4 — referencja względem DoD

| Kryterium DoD                                  | Wynik                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIFO wybiera najwcześniej wygasający (US-7.1)  | ✅ kredyty wydane w ODWROTNEJ kolejności do wygasania — bez tego test przechodziłby też przy sortowaniu po kolejności wstawienia                                                    |
| Priorytet dziecka przed portfelem rodzinnym    | ✅ kredyt rodzinny wygasa WCZEŚNIEJ, a i tak wygrywa zarezerwowany (US-7.4/AC2); portfel rodzinny wydawalny przez dowolne dziecko (AC1), zarezerwowany — nie przez rodzeństwo       |
| **US-7.2 — równoległa konsumpcja**             | ✅ dwa żądania, jeden kredyt, `holdMs` poszerza okno: dokładnie jeden `creditId`, jeden `used`, jeden booking z `consumedCreditId`. **Zweryfikowane mutantem** — patrz niżej        |
| Grant bez powodu odrzucony (US-7.3/AC1)        | ✅ przez realny formularz, żądanie dochodzi do backendu (pole bez `required` w markupie — D53); po odrzuceniu **zero wierszy**, nie „wiersz bez powodu"                             |
| Wpis audytu przy sukcesie (US-7.3/AC2)         | ✅ kto/komu/ile/jaki typ/powód/kiedy w `metadata`; „Credits granted" widoczne na stronie audytu organizacji                                                                         |
| Wygasanie w strefie organizacji (US-1.2/AC3)   | ✅ 8 testów Vitest (Warszawa przez obie zmiany czasu, Kolkata +05:30, Auckland — DST odwrotnie, grudzień→styczeń, granica wyłączna) + e2e asertujący lokalny odczyt `00:00` 1. dnia |
| Kredyt wygasły niewydawalny **bez** sweepa     | ✅ wiersz nadal `available`, ale `availableBalance=0` i konsumpcja zwraca `null` — dostępność rozstrzyga `validUntil`, nie kolumna statusu                                          |
| Sweep nie nadpisuje `used`                     | ✅ kredyt wydany przed sweepem pozostaje `used`; wygasły → `expired`; drugie uruchomienie idempotentne                                                                              |
| §4.2 (backend jest granicą)                    | ✅ `reception` dostaje 403 na `/credits` — rola istnieje w organizacji, uprawnienia nie ma                                                                                          |
| Migracje od zera                               | ✅ `docker compose down -v && pnpm db:up && pnpm db:migrate` → **23/23**, 4 polityki, `FORCE` na obu tabelach, FK obecny                                                            |
| **Cała suita e2e**                             | ✅ **184 passed, 3 skipped, 0 failed** na czystej bazie (baseline F3: 175+3; +9 nowych)                                                                                             |
| `lint` / `typecheck` / `test` / `format:check` | ✅ wszystkie zielone (Vitest **21/21**, było 13)                                                                                                                                    |

**Weryfikacja mutantem (US-7.2)** — usunięcie `for update skip locked` z zapytania konsumpcji: test pada (`Expected length: 1, Received length: 2`), więc ma zęby. Wynik ujawnił przy okazji, że **obie warstwy ochrony działają niezależnie**: bez blokady oba żądania wybrały ten sam wiersz, ale predykat `status = 'available'` w `spendCredit` wykrył to i wywalił transakcję przegranego (`credit … was not available at spend time`) zamiast dopuścić podwójne wydanie. Blokada odpowiada więc za **czystą** odmowę (przegrany dostaje „brak kredytu", co jest normalną ścieżką do zakupu), a predykat — za to, że nawet jej usunięcie nie psuje danych, tylko głośno pada.

#### Rozstrzygnięcia podjęte w Fazie 4

| #   | Decyzja                                                                                          | Uzasadnienie                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D47 | `credit.validUntil` jako **instant `timestamptz`, granica WYŁĄCZNA** — odejście od „date" z §1.2 | Reguła spec („koniec miesiąca w `organization.timezone`") wymaga zastosowania strefy gdzieś. Zastosowana RAZ, przy wydaniu, sprowadza wygaszanie do globalnego `validUntil <= now()`. Data goła zepchnęłaby strefę do każdego czytelnika, a sweep — z definicji wielotenantowy — porównywałby datę lokalną z zegarem UTC |
| D48 | FK `booking.consumedCreditId → credit` w **ręcznym SQL**, nie w `bookings.ts`                    | `credit` wskazuje na `booking` dwukrotnie, więc zadeklarowanie drugiej strony w Drizzle dałoby cykl importów w barrelu schematu — ta sama klasa problemu, która wyprodukowała `class_session` (D11). Constraint jest przez to niewidoczny dla snapshotu, jak EXCLUDE i polityki                                          |
| D49 | **Strona `/orgs/[slug]/credits` dołożona do zakresu F4** (plan mówił „bez UI")                   | Plan wykluczał UI **klienckie**. DoD wymaga jednak odrzucenia grantu bez powodu i wpisu audytu — a bez formularza `grantCreditsAction` byłaby nietestowalnym martwym kodem do F13. Panel admina jest jedynym miejscem w tej fazie, gdzie decyzję podejmuje człowiek                                                      |
| D50 | Sweep wygaszania **nie jest źródłem prawdy o dostępności** — `validUntil` jest                   | Cron na Vercel Hobby jest dzienny, a zewnętrzny pinger może dzień pominąć. Job, którego brak pozwalałby wydać martwy kredyt, uzależniałby poprawność od uptime'u infrastruktury. Sweep tylko uzgadnia kolumnę `status`; wąski bypass RLS obejmuje wyłącznie listę roboczą, zapisy wracają do kontekstu własnego tenanta  |
| D51 | **Trzecie wystąpienie pułapki z D46**: `0021` dostało `when` mniejsze niż ręczne `0020`          | Wykryte sprawdzeniem journala PRZED uruchomieniem, nie błędem runtime. Reguła z F2/F3 zadziałała dokładnie jak zapisana. Skoro pułapka wraca przy każdej fazie dokładającej migrację, warto rozważyć skrypt sprawdzający monotoniczność w CI zamiast polegać na pamięci                                                  |
| D52 | W surowym SQL instant bindowany jako **ISO string + `::timestamptz`**                            | Driver postgres-js odrzuca `Date` przekazany przez raw template (`ERR_INVALID_ARG_TYPE`), a bez rzutowania porównanie byłoby tekst-do-timestampa. Query builder załatwia to sam; raw SQL to jedyne miejsce, gdzie trzeba powiedzieć wprost                                                                               |
| D53 | Pole „powód" **bez atrybutu `required`** w markupie                                              | US-7.3/AC1 dotyczy odmowy po stronie SERWERA — bo żądanie, które nigdy nie przeszło przez ten formularz, też musi zostać odrzucone. `required` w przeglądarce schowałby tę odmowę za dymkiem walidacji i zostawił regułę bez pokrycia testem. Hint przy polu informuje admina, serwer egzekwuje                          |

**Odnotowane, nienaprawiane w tej fazie:** React resetuje niekontrolowany formularz po wykonaniu server action, więc odrzucony grant czyści też oba selecty i liczbę. To zachowanie ogólnorepozytoryjne (tak samo działają formularze lokalizacji i typów grup z F2), nie regres wprowadzony tutaj — test odzwierciedla je wprost, zamiast udawać, że wartości przetrwały.

---

### Faza 4.5 — ⚠️ Middleware subdomenowy: rozpoznanie tenanta z `Host`

**Status:** ✅ **zakończona** (2026-07-20)
**Cel:** jeden punkt rozpoznania `Host` → subdomena akademii, publikowany do warstwy żądania nagłówkiem; jedno źródło listy zarezerwowanych prefiksów ścieżki; szew dla stron CMS; zamknięcie długu D39.
**Pokrywa:** §2.27 (adresowanie); zależność blokującą przed EPIK 4 i przed modułem CMS (`docs/specyfikacja-cms.md`).
**Zależności:** F0 (`organization.subdomain`), F3 (`findOrganizationBySubdomain` jako zaprojektowany szew).

**Powód wstawienia fazy:** F5 pokrywa EPIK 4, a routing subdomenowy był wpisany w „Otwarte pytania" jako zależność blokująca przed EPIK 4. Zamiast wciągać infrastrukturę routingu do fazy o publicznym zapisie, dostała własną, wąską fazę.

**Świadomie POZA zakresem → F4.6:** migracja `/orgs/[slug]/…` → `/dashboard/…`, usunięcie przełącznika organizacji (§2.19 wyjątek #5), `BETTER_AUTH_URL` zależny od hosta. Uzasadnienie: migracja panelu dotyka `requireOrgAccess` (chokepoint każdej strony i akcji org), ~6 speców e2e i `context-switch.spec.ts` — to druga decyzja produktowa, nie efekt uboczny routingu. **Poza zakresem bez fazy docelowej:** domeny własne (CNAME) i wildcard TLS.

**Migracja bazy: ŻADNA** — `organization.subdomain` istnieje od F0. Pułapka monotoniczności `when` (D46/D51) nie dotyczy tej fazy.

**Zrealizowany zakres:** `src/lib/tenant-host.ts` (`parseHost`, czysta funkcja) + 16 testów Vitest; `src/features/cms/reserved-slugs.ts` (prefiksy ze znacznikiem `stage`) + 10 testów; `APP_ROOT_DOMAIN` (runtime) i `allowedDevOrigins`; trzy dotknięcia `src/proxy.ts` (parsowanie na górze, publikacja w `forward` z bezwarunkowym `delete`, rozgałęzienie tenant/apex, `apexUrl`); `src/features/organizations/served-org.ts`; szew `[locale]/(site)/[...cmsSlug]` + bramka tenanta w `[locale]/page.tsx`; cztery trasy `/api/client-auth/*` bez pola `subdomain` (D39 zamknięty); `e2e/host-fixtures.ts`, `baseURL` na apeksie, fixture `sharedRequest`; `e2e/langlion-subdomain-routing.spec.ts` (14 testów); krok DNS w CI; sekcje w `ARCHITECTURE.md`.

#### Raport z realizacji Fazy 4.5 — referencja względem DoD

| Kryterium DoD                                    | Wynik                                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ścieżka niezarezerwowana → gałąź CMS             | ✅ 404 ze szwu i **brak nagłówka `Location`** — asercja negatywna dowodzi, że żądanie nie spadło do default-deny                                   |
| Kolejność względem `isPublicBarePage`            | ✅ apeks `/en` → 200 (landing bez zmian), goła subdomena `/en` → **404, nie landing**. Ta para jest dowodem kolejności                             |
| Nieznana akademia (D57)                          | ✅ 404 i **żadnego przekierowania**, tak samo na stronie i na `/api/client-auth/session`                                                           |
| **Anty-spoofing (D56) — zweryfikowany mutantem** | ✅ podrzucony `x-org-subdomain` na apeksie → 404. **Usunięcie `delete` wywala ten test** — patrz niżej                                             |
| Prefiks „apex" na hoście tenanta (D60)           | ✅ `/en/dashboard` → 307 na apeks; asercja na **hoście** w `Location`, nie tylko na ścieżce (redirect na `/login` tego samego hosta też byłby 307) |
| Prefiks „tenant" na apeksie                      | ✅ `/en/zapisy/...` → 404. **Ta gałąź była w planie, ale nie w kodzie** — brak wykryty testem, nie recenzją                                        |
| D39 — pełna ścieżka OTP bez pola                 | ✅ wydanie kodu, redempcja i sesja przez sam `Host`; `logout` z **pustym ciałem** → 200                                                            |
| D39 — pole w ciele jest ignorowane               | ✅ żądanie do A z `subdomain: B` w payloadzie tworzy klienta **w A**. Dowód, że kontrakt się zmienił, a nie że dołożono fallback                   |
| **Izolacja per host (domyka D40)**               | ✅ jedna przeglądarka trzyma teraz sesje w **dwóch** akademiach naraz; sesja z A odpytana na hoście B → `null`, bo cookie nie zostało **wysłane**  |
| Rate limit a host (D61)                          | ✅ 30 żądań na hoście A wyczerpuje tier `write`, 31. na hoście B → 429. Patrz korekta założenia niżej                                              |
| Migracje od zera                                 | ✅ `docker compose down -v` → **23/23**; faza nie dodała migracji                                                                                  |
| **Cała suita e2e**                               | ✅ **199 passed, 3 skipped, 0 failed** na czystej bazie, w konfiguracji CI (`--workers=1`); baseline F4: 184+3, +15 nowych                         |
| `pnpm dev` z subdomeną (ręcznie)                 | ✅ `allowedDevOrigins` działa, `localhost` nadal apeksem, `/en/dashboard` → 307 na apeks z zachowanym portem. **Znalazło lukę** — patrz niżej      |
| `lint` / `typecheck` / `test` / `format:check`   | ✅ wszystkie zielone (Vitest **47/47**, było 21)                                                                                                   |

**⚠️ Luka znaleziona ręczną weryfikacją w `pnpm dev`, JUŻ PO napisaniu testów:** nieistniejąca subdomena pod ścieżką **korzeniową** serwowała landing marketingowy langliona (200 zamiast 404). Przyczyna: bramka w `[locale]/page.tsx` pytała „czy ta akademia istnieje" (`servedOrganization()`), a powinna pytać „czy w ogóle zaadresowano hosta akademii" (`servedSubdomain()`) — warunki wyglądają równoważnie i nie są, bo pierwszy zwraca `null` również dla akademii nieistniejącej. Skutek był dokładnie tym, czego D57 zabrania na wszystkich innych ścieżkach: dowolne `*.langlion.pl` serwujące naszą stronę marketingową pod swoim korzeniem. **Żaden test tego nie złapał**, bo spec „goła subdomena nie serwuje marketingu" używał akademii **zaseedowanej**. Naprawione, dołożony test z nieistniejącą subdomeną pod `/`. Wniosek na przyszłość: przy bramkach tenantowych testować osobno akademię istniejącą i nieistniejącą — to dwie różne gałęzie, nie jedna.

**Niestabilność testów zależnych od kolejki — WCZEŚNIEJSZA, nie wprowadzona przez tę fazę.** Przy `fullyParallel` na świeżo utworzonej bazie `langlion-schedule` i część speców mailowych bywają czerwone. Zmierzone tym samym poleceniem: `--repeat-each=3` dało **6 porażek na 33 na kodzie BEZ F4.5** wobec **3 na 33 z F4.5**, więc faza tego nie pogarsza. W konfiguracji CI (`--workers=1`), która jest bramką merge'a, suita jest zielona. Osobno i już naprawione: pierwsza wersja testu D61 zamiatała endpoint OTP, kolejkując 21 maili — to realnie głodziło kolejkę i wywracało niepowiązane speki, więc test przepisano na `/api/client-auth/logout` (ta sama oś, zero maili).

**Weryfikacja mutantem (D56):** usunięcie `requestHeaders.delete(ORG_SUBDOMAIN_HEADER)` z `forward()` — test „a client-supplied tenant header cannot select an academy" pada (404 → 200), więc ma zęby. Ujawniło przy okazji, że **drugi test spoofingu przechodzi mimo mutanta**: na hoście tenanta `set` i tak nadpisuje podrzuconą wartość. Obie asercje są sensowne, ale nie są zamienne — tylko pierwsza pilnuje `delete`.

#### Rozstrzygnięcia podjęte w Fazie 4.5

| #   | Decyzja                                                                     | Uzasadnienie                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D54 | Proxy **parsuje** host, nie **rozwiązuje** organizacji                      | Nagłówek `proxy.ts` obiecuje guard bez DB, a matcher obejmuje niemal każde żądanie — również apeks, gdzie żadna akademia nie istnieje. Dokumentacja Next 16 mówi to samo niezależnie. Konsekwencja: proxy nie odróżnia akademii od literówki i nie powinno             |
| D55 | Publikacja nagłówka w `forward()`, nie w przepływie                         | Escape metadata-image jest **pierwszym** `return` w pliku, a OG card strony akademii to dokładnie żądanie potrzebujące tenanta. Ta sama zasada, którą plik stosuje dla CSP i request-id                                                                                |
| D56 | `delete` nagłówka **bezwarunkowo**, przed `set`                             | Klient może wysłać `x-org-subdomain`, a warstwa żądania traktuje go jako argument autorytetu. `else` zostawiłby podrzuconą wartość dokładnie na gałęzi, która ma znaczenie. Przy okazji domknięta ta sama, istniejąca luka dla `LOCALE_HEADER` na ścieżce `/api/*`     |
| D57 | Nieznana subdomena → **404**, nie redirect na apeks                         | Wildcard DNS sprawia, że każda etykieta odpowiada — 30x zamieniłby dowolne `*.langlion.pl` w link lądujący na naszym marketingu. Dodatkowo rodzic z ulotki dostałby ofertę produktu zamiast odpowiedzi                                                                 |
| D58 | `RESERVED_SUBDOMAINS` i `RESERVED_PATH_PREFIXES` pozostają **osobne**       | Etykiety DNS vs pierwsze segmenty ścieżki; różny autorytet, różny moment odczytu, różny skutek pomyłki. Przecięcie (`api`, `admin`) jest przypadkiem. Jedna z list to jednokierunkowa zapadka. Dwustronny odsyłacz w nagłówkach obu plików                             |
| D59 | URL strony CMS: **`/{locale}/{slug}`**                                      | Odejście od dosłownego `specyfikacja-cms.md:53`. Alternatywa wymagałaby rewrite'u w proxy — złamania niezmiennika, na którym opiera się poprawność guarda. Konsekwencja: kody lokali są zarezerwowanymi slugami, wyprowadzane z `LOCALES`                              |
| D60 | Prefiksy zarezerwowane niosą **`stage`** (`tenant`/`apex`)                  | Bez tego `/dashboard` na hoście akademii spada do default-deny i przekierowuje na `/login` **tego hosta**, gdzie cookie Better Auth nie istnieje — pętla logowania bez komunikatu. F4.6 to zmiana znacznika, nie przeprojektowanie routingu                            |
| D61 | Rate limit **nie** jest kluczowany hostem                                   | Przy wildcard DNS każdy host byłby świeżym kubełkiem, więc atakujący mnożyłby budżet rotacją subdomen. **Korekta w trakcie:** kubełek _adresowy_ jest kluczowany `(organizationId, email)` — świadomie, wg rewizji 14.1 — więc oś przechodzącą przez hosty jest IP     |
| D62 | `parseHost` przyjmuje domenę bazową **parametrem**, nie czyta env           | `vitest.config.ts` zabrania testom sięgać do `@/lib/env/server` (walidacja całego env przy imporcie). Czytanie env uczyniłoby moduł nietestowalnym — dla funkcji, której całą pracą jest manipulacja stringiem                                                         |
| D63 | Subdomeny w E2E z **`uniqueSubdomain`**, nie z `uniqueId`                   | `uniqueId` łączy podkreślnikami, których `SUBDOMAIN_PATTERN` nie dopuszcza — taki host parsuje się jako `foreign` i **każdy** test client-auth dostałby 404. Objaw wyglądałby na zepsuty lookup, a jest nieprawidłową nazwą                                            |
| D64 | Bramka landingu w `[locale]/page.tsx`, nie w catch-allu                     | Catch-all **nie łapie ścieżki pustej**, więc `/en` na hoście akademii trafiłby na landing marketingowy. To jedyna trasa, której proxy nie rozdziela, więc rozdzielenie dzieje się tam                                                                                  |
| D66 | Bramka landingu pyta **`servedSubdomain()`**, nie `servedOrganization()`    | „Czy zaadresowano hosta akademii" ≠ „czy ta akademia istnieje". Drugi warunek zwraca `null` również dla nieistniejącej akademii, więc każde `*.langlion.pl` serwowałoby nasz marketing pod korzeniem. Znalezione ręcznie w `pnpm dev`, nie testem — patrz raport wyżej |
| D65 | Fixture **`sharedRequest`** (`context.request`) obok istniejącego `request` | `playwright.request.newContext()` ma własny słoik cookies, więc „sesja z A nie działa w B" przechodziłaby trywialnie, niezależnie od hostów. `context.request` dzieli słoik z przeglądarką i respektuje zasięg per host — dopiero wtedy test dowodzi mechanizmu        |

---

### Faza 4.6 — Migracja panelu personelu na hosty tenantów

**Status:** nierozpoczęta
**Cel:** panel akademii przenosi się z `/orgs/[slug]/…` na `{subdomain}.langlion.pl/dashboard/…`, zgodnie z §2.27; znika przełącznik organizacji (§2.19 wyjątek #5).
**Pokrywa:** §2.27 (część panelowa), §2.19 wyjątek #5; zamyka „Dług routingu z Fazy 2".
**Zależności:** F4.5 ✅ (rozpoznanie hosta, `servedOrganization`, znaczniki `stage`).
**Zakres:** przeniesienie folderów tras `(app)/orgs/[slug]/…` → `(app)/dashboard/…`; `requireOrgAccess` przestaje brać `slug`, bierze tenanta z hosta; flip znaczników `dashboard`/`login`/`logout`/`settings` z `apex` na `tenant` w `reserved-slugs.ts`; usunięcie `AccountSwitcher` i `context-switch.spec.ts`; `BETTER_AUTH_URL` zależny od hosta żądania (albo `trustedOrigins`) — dziś jedna stała, poprawna wyłącznie dopóki auth personelu żyje na apeksie; request-aware wariant `absoluteUrl()` dla linków w mailach; przeniesienie `findOrganizationBySubdomain` z `features/client-auth/` do `features/organizations/`.
**DoD:** personel loguje się pod subdomeną akademii i nie widzi przełącznika; Membership w dwóch akademiach wymaga osobnego logowania (§2.19); linki w mailach prowadzą pod właściwy host; `/orgs/[slug]/…` przestaje istnieć; suita zielona.

---

### Faza 5 — Publiczny zapis + płatność na miejscu + współbieżność end-to-end

**Status:** nierozpoczęta
**Cel:** pierwszy pełny przepływ wartości: rodzic zapisuje dziecko przez publiczny link, płaci na miejscu, wszystkie trzy ochrony §5 działają na żywej ścieżce.
**Pokrywa:** EPIK 4 (US-4.1–4.6), EPIK 6 (US-6.2), EPIK 14 (US-14.1–14.3), EPIK 15; §2.3, §2.7 (Proces A — fundament).
**Zależności:** F2 (typy/sesje), F3 (client+OTP), F4 (kredyty — ścieżka `booked_offline` nie konsumuje ich jeszcze, ale model jest wspólny).
**Zakres:** publiczna strona `/zapisy/[slug]` (public-routes, SEO-neutralna), formularz (dla kogo, uczestnik, kontakt, metoda płatności wg `payment_policy`/`allowed_purchase_modes`), upsert client/athlete + OTP (F3), utworzenie `booking` w transakcji z blokadą §5.2 (`FOR UPDATE` + count aktywnych vs capacity; `payment_pending` liczy się jako aktywna) i constraintem §5.3; `price_snapshot` z kwotą integer + walutą; obsługa odrzucenia przez constraint jako czytelny komunikat (US-14.1/AC2); brak listy rezerwowej (EPIK 15).
**DoD:** e2e: pełny happy path zapisu z OTP i `booked_offline`; dwóch klientów na ostatnie miejsce — jeden sukces; kolizja zawodnika odrzucona niezależnie od roli; cena zamrożona mimo późniejszej zmiany na Definicji; suita zielona.

---

### Faza 6 — Panel trenera i recepcji

**Status:** nierozpoczęta
**Cel:** personel widzi uczestników i rozlicza płatności na miejscu.
**Pokrywa:** EPIK 6 (US-6.1, US-6.3), EPIK 16, **EPIK 31 (v15)**; §2.10 (uprawnienia `credits.confirm_on_site`, **`bookings.mark_attendance`**), **§2.29**.
**Zależności:** F5.
**Zakres:** widoki listy sesji/uczestników dla ról trainer/reception (statusy kolorami: `confirmed` zielony, `booked_offline` żółty); akcja „Zatwierdź gotówkę" → w jednej transakcji kredyt `on_site_payment` generowany + konsumowany + `booking → confirmed` + `recordAudit` (kto/kiedy/która rezerwacja); `no_show` bez automatycznych konsekwencji; brak automatycznego zwalniania miejsca przy braku zapłaty (US-6.2).
**Zakres dołożony w v15 (potwierdzanie obecności, EPIK 31):** trzy kolumny na `booking` — `attendance_status` (enum `unmarked`|`present`|`absent`, default `unmarked`), `attendance_marked_at`, `attendance_marked_by_user_id` (migracja additive); uprawnienie `bookings.mark_attendance` w statycznej mapie `src/features/rbac/index.ts` (Rozstrzygnięcie #4); oznaczanie z tej samej listy uczestników, która niesie statusy płatności; ograniczenie trenera do **własnych** sesji egzekwowane na backendzie, nie filtrem listy w UI; `recordAudit` przy każdym oznaczeniu i nadpisaniu.
**Uwaga do migracji (v15) — nie pomijać jako „oczywistej" zmiany schematu:** nagłówek migracji dodającej `attendance_status` ma zawierać jedno zdanie potwierdzające **brak konfliktu z EXCLUDE constraint §5.3** (`booking_athlete_no_overlap_excl`): predykat constraintu filtruje po `payment_status` (`NOT IN ('cancelled')`), nie po `attendance_status`, więc nowa kolumna nie zmienia zbioru wierszy objętych wykluczeniem ani nie wymaga przebudowy indeksu. Zgodnie z konwencją dokumentowania nietrywialnych własności constraintów ustaloną w F0/F1a (por. ryzyko #2 „RLS × `ON CONFLICT`").
**DoD:** e2e: recepcja zatwierdza gotówkę → status i audyt; trener widzi statusy, ale bez uprawnienia nie zatwierdza; **trener oznacza obecność na własnej sesji, a na cudzej dostaje odmowę z backendu; oznaczenie obecności nie zmienia `payment_status`, a `unmarked` jest odróżnialne od `absent`**; AC z EPIK 31 pokryte; suita zielona.

---

### Faza 7 — Dopisanie, anulowanie 24h, odrabianie, anulowania administracyjne

**Status:** nierozpoczęta
**Cel:** samoobsługowy cykl życia rezerwacji klienta + narzędzia admina.
**Pokrywa:** EPIK 8, 12, 13; US-19.2 (odwołanie sesji — kompensacja; powiadomienia e-mail-only, retrofit in-app w F14).
**Zależności:** F5 (booking), F4 (kredyty), F6 (panel — dla ścieżek admina).
**Zakres:** Dopisanie (Proces A) w panelu klienta — konsumpcja FIFO przez tę samą transakcję §5.2/§5.3; odwołanie przez klienta z regułą 24h (kredyt `cancellation` wyłącznie za `confirmed`; `booked_offline` → cancelled bez kredytu); odrabianie = Dopisanie kredytem `cancellation` w ramach tego samego `group_type`; anulowanie rezerwacji przez admina (kredyt niezależnie od 24h dla `confirmed`); odwołanie całej sesji przez admina (status `cancelled`, kredyty `admin_session_cancellation` dla opłaconych, e-maile do dotkniętych); uprawnienie `bookings.cancel_reschedule`.
**DoD:** e2e na wszystkie AC EPIK 12 (w tym granica 24h) i EPIK 8; odwołanie sesji generuje kredyty tylko dla opłaconych; suita zielona.

---

### Faza 8 — Soft delete domenowy + reasygnacje

**Status:** nierozpoczęta
**Cel:** bezpieczne wycofywanie zasobów z obiegu (Zasada #4: blokada z listą zależności, nie kreator).
**Pokrywa:** EPIK 20, 21; §2.11.
**Zależności:** F7 (odwołanie sesji jako narzędzie rozwiązywania zależności).
**Zakres:** dezaktywacje z bramkami: `group_type` (blokada przy aktywnym `is_recurring` lub przyszłych sesjach), trener/offboarding (blokada przy przyszłych sesjach, lista w toaście), `credit_type` (istniejące kredyty żyją do wygaśnięcia), `location` (ostrzeżenie, NIE twarda blokada — decyzja #6 spec §7); substytucja trenera w pojedynczej sesji (constraint §5.1 = hard block); masowa zmiana trenera (osobna tx per sesja, pominięcia + raport zbiorczy); Mass Move Bookings (per uczestnik: capacity + kolizja; UPDATE bookingu, nie recreate; lista „wymaga ręcznej interwencji"); uprawnienia `trainers.offboard`, `sessions.mass_reassign_trainer`, `sessions.mass_move_bookings`, `group_types.deactivate`.
**DoD:** e2e na AC US-21.x i US-20.1; raporty częściowego sukcesu; suita zielona.

---

### Faza 9 — ⚠️ Plany i limity jako dane w DB (EPIK 29; odejście od plans.ts)

**Status:** nierozpoczęta
**Cel:** definicje planów/limitów/featur w bazie, edytowalne przez Super Admina bez deploya (Zasady #5/#6); egzekwowanie limitów na backendzie.
**Pokrywa:** EPIK 29 w całości; §2.20–§2.23; spec §5 pkt 8a.
**Zależności:** istniejący adapter billingowy (Platform Billing); zasoby limitowane z F2–F5 (athlete, group_type, trenerzy, location, session).
**Zakres:** tabele `plan`, `plan_limit_definition`, `plan_feature_flag`, `organization_limit_override`; `organization.plan_id` NOT NULL (migracja: seed planu `trial` + backfill istniejących organizacji); panel Super Admina „Plany i limity" (CRUD, każdy zapis przez `recordAudit` z aktorem SuperAdmin i from→to); helper egzekwowania: kolejność override → plan → **fail-closed**, live COUNT bez `FOR UPDATE` (decyzje #10–#12 spec §7), wpięty we WSZYSTKIE punkty z tabeli §2.20; feature gating §2.21 (UI „wymaga planu X" + backend); zmiana planu przez istniejący checkout/portal — webhook `customer.subscription.updated` mapuje `plan.stripe_price_id` → `organization.plan_id` (idempotencja jak w `webhooks.ts`); downgrade nie blokuje, blokuje tylko nowe operacje ponad limit; powiadomienia `plan_limit_approaching`/`plan_limit_reached` e-mail-only (retrofit F14). **Decyzja w tej fazie:** los `plans.ts` i tabeli cen na landing (langlion czyta plany z DB; boilerplate'owy pricing do przepięcia albo zamrożenia).
**DoD:** e2e: limit blokuje 26. ucznia przy max 25 i przestaje po podniesieniu limitu bez deploya; fail-closed przy braku wpisu; override per organizacja wygrywa z planem; webhook zmienia plan idempotentnie; audyt zmian konfiguracji; suita zielona.

---

### Faza 10 — ⚠️ Stripe Connect per organizacja (EPIK 30; Zasada #7)

**Status:** nierozpoczęta
**Cel:** każda akademia podłącza WŁASNE konto Stripe (Standard Connect); platforma nigdy nie miesza go z kontem Platform Billing.
**Pokrywa:** EPIK 30 w całości; §2.24–§2.26; Constraint 7; spec §5 pkt 8b.
**Zależności:** F9 (kolejność spec 8a→8b; wspólny adapter).
**Zakres:** rozszerzenie kontraktu adaptera billingowego o operacje Connect (utworzenie/odnalezienie Standard account, link OAuth, wymiana kodu, tworzenie Checkout/PaymentIntent/Price **z jawnym wskazaniem konta docelowego** — parametr obowiązkowy, nie domyślny); kolumny `stripe_connect_account_id/status/charges_enabled/payouts_enabled/connected_at` na `organization`; routing webhooków: rozróżnienie eventów konta platformy vs Connected Account (US-30.4/AC2), obsługa `account.updated` → status (`onboarding_incomplete`/`active`/`restricted`/`disabled`) wyłącznie webhookiem, nigdy redirectem; sekcja „Płatności" w panelu (stały wskaźnik statusu); bramka §2.25 na backendzie (każda próba online-checkout odrzucana przy `status != active`; cash zawsze działa); uprawnienie `billing_connect.manage` wyłącznie owner (decyzja #14); powiadomienie `stripe_connect_requires_attention` (e-mail do F14).
**DoD:** e2e (offline, wzorzec podpisu HMAC jak `billing-webhook.spec.ts`): pełny cykl statusów przez `account.updated`; bramka odrzuca online przy każdym statusie ≠ active; admin bez uprawnienia nie widzi/nie wykona connect; testy jednostkowe rozróżnienia kont (Zasada #7); suita zielona.

---

### Faza 11 — Płatność online za pojedyncze zajęcia (EPIK 5)

**Status:** nierozpoczęta
**Cel:** klient płaci online za pojedyncze zajęcia; miejsce potwierdza wyłącznie webhook.
**Pokrywa:** EPIK 5; §2.4 (source `online_payment`); US-4.4 (metoda online w formularzu).
**Zależności:** F5 (booking `payment_pending`), F10 (Connect — checkout na Connected Account).
**Zakres:** generowanie Checkout na Connected Account organizacji (bramka §2.25); webhook potwierdzenia → w jednej transakcji: kredyt `online_payment` utworzony + skonsumowany + `booking → confirmed` (US-5.1/AC1); redirect NIGDY nie potwierdza (AC2); kredyt atomowy niewidoczny w portfelu (AC3); idempotencja przez `webhook_event`.
**DoD:** e2e: happy path online; redirect bez webhooka nie potwierdza; podwójna dostawa webhooka nie duplikuje kredytu; suita zielona.

---

### Faza 12 — Pakiety i subskrypcje (EPIK 9, 10, 23, 25)

**Status:** nierozpoczęta
**Cel:** sprzedaż pakietów (gotówka + online + subskrypcje) z auto-wypełnieniem terminów.
**Pokrywa:** EPIK 9, 10, 23, 25; §2.5, §2.6, §2.13, §2.15; spec §5 pkt 9.
**Zależności:** F4 (kredyty), F6 (recepcja), F11 (checkout online).
**Zakres (podfazami wewnątrz, w tej kolejności):**
a) `product_template` (walidacja Constraint 4: `billing_type` ⊆ `allowed_billing_types`; feature gating `subscriptions_enabled` z F9; blokada online-template przy braku Connect) + `credit_purchase`;
b) zakup gotówką (US-10.x): zatwierdzenie recepcji = źródło prawdy, job w tle: rozliczenie zaległych `booked_offline` FIFO → auto-fill §7.5a (jednorazowa, nieponawiana próba per termin, przez pełną ochronę §5) → reszta do portfela;
c) pakiety online one-time na Connected Account (webhook → kredyty → auto-fill);
d) subskrypcje: `stripe_subscription_id` na Connected Account, `invoice.paid` → kredyty + auto-fill (idempotencja §12.3/US-9.2), `invoice.payment_failed` → `subscription_status=past_due` + e-mail z linkiem do Customer Portal (US-25.x; kredyty nigdy nie są cofane), `customer.subscription.deleted` → `canceled`;
e) nieretroaktywność zmian polityki (US-23.5/23.6) + ostrzeżenie „package bez aktywnego template" (US-23.4).
**Wymóg z Rozstrzygnięcia #20 (dotyczy podfaz c i d):** ścieżka checkoutu pakietowego musi dopuszczać ad-hoc `price_data` jako alternatywę dla `product_template.stripe_price_id` **już od startu tej fazy**, nie dopiero w F21 — to jedyny sposób wyrażenia rabatu per klient zmiennego między cyklami (§2.31). Zbudowanie jej wyłącznie wokół gotowego `stripe_price_id` wymusi w F21 przeprojektowanie zamiast rozszerzenia (patrz „Ryzyka techniczne", ostatni punkt).
**DoD:** e2e na AC EPIK 9/10/23/25 (w tym częściowy auto-fill z powiadomieniem e-mail, podwójny webhook odnowienia bez duplikatów); suita zielona.

---

### Faza 13 — Portfel klienta UI (§7.12)

**Status:** nierozpoczęta
**Cel:** klient widzi kredyty tylko wtedy, gdy ma z czego korzystać.
**Pokrywa:** US-7.6; spec §5 pkt 11.
**Zależności:** F12 (wszystkie źródła kredytów istnieją).
**Zakres:** sekcja portfela w panelu klienta — widoczna wyłącznie przy niezerowym saldzie `available`; pozycje ze źródłem i `valid_until`; kredyty atomowe (drop-in) nigdy niewidoczne; „Nadchodzące zajęcia" zawsze widoczne.
**DoD:** e2e na US-7.6 AC1–AC4; suita zielona.

---

### Faza 14 — ⚠️ Notification Center domenowy (EPIK 26; odejście #1)

**Status:** nierozpoczęta
**Cel:** dedykowana encja powiadomień langlion (odbiorcy: klienci + personel) z katalogiem zdarzeń edytowalnym bez deploya; retrofit wszystkich wcześniejszych zdarzeń e-mail-only.
**Pokrywa:** EPIK 26; §2.16; spec §5 pkt 12.
**Zależności:** F3 (klienci), F5–F12 (zdarzenia istnieją).
**Zakres:** tabele `notification_event_type` (słownik: default_channels, `is_overridable` — false dla finansowych/bezpieczeństwa), `notification` (recipient_type `client`|`staff`, polimorficzny odbiorca, content po podstawieniu zmiennych, channel_sent), `notification_preference`; jeden punkt emisji (serwis + job, wzorzec `enqueueNotification` boilerplate'u); preferencje klienta w jego panelu (odrzucenie wyłączenia dla `is_overridable=false` — US-26.1/AC2); dzwonek + licznik w panelu klienta (polling, jak boilerplate); seed katalogu z tabeli §2.16 (w tym `plan_limit_*` z F9 i `stripe_connect_requires_attention` z F10); **retrofit**: wszystkie zdarzenia wysyłane dotąd e-mailem przechodzą przez katalog (e-mail + in-app wg preferencji).
**DoD:** e2e: preferencje respektowane, niewyłączalne odrzucane, jedno zdarzenie wielu odbiorców = osobne rekordy; retrofit potwierdzony na min. 3 wcześniejszych zdarzeniach (odwołanie sesji, zmiana wzorca, częściowy auto-fill); suita zielona.

---

### Faza 15 — Zmiana Grupy (swap) + przeniesienie kredytu między dziećmi

**Status:** nierozpoczęta
**Cel:** Proces B — wniosek, decyzja admina, świadoma dopłata/zwrot, finalizacja webhookiem.
**Pokrywa:** EPIK 11; §2.7; §7.1a (przeniesienie kredytu — US-7.5); spec §5 pkt 13.
**Zależności:** F7 (wzajemne wykluczenie z odwołaniem), F11 (PaymentIntent dopłaty), F14 (powiadomienia), F16 dla `price_difference < 0` — zwrot można w tej fazie oznaczyć jako zależny od F16 albo zrealizować wspólny mechanizm zwrotu tu i reużyć w F16 (decyzja na starcie fazy).
**Zakres:** `group_change_request` (pełny cykl: submitted → admin_approved/admin_rejected → awaiting_payment → completed/expired/cancelled_by_*), zamrożenie `price_difference`, booking `payment_pending` blokujący miejsce + `expires_at` 24h (decyzja #3), cron wygaszania, anulowania obustronne, kaskada przy odwołaniu sesji docelowej (US-11.6), wzajemne wykluczenie z odwołaniem (US-11.8/US-12.3), idempotencja webhooka dopłaty, audyt każdego przejścia stanu (US-11.7), uprawnienie `group_swap.approve`; przeniesienie kredytu między dziećmi: wniosek rodzica → zatwierdzenie (`credits.reassign_athlete`) → update `athlete_id` + audyt.
**DoD:** e2e na AC US-11.1–11.8 i US-7.5; suita zielona.

---

### Faza 16 — Zwroty fiducjarne (EPIK 18)

**Status:** nierozpoczęta
**Cel:** zwroty częściowe i pełne z cofnięciem, ze źródłem prawdy zależnym od metody płatności.
**Pokrywa:** EPIK 18; §2.9; spec §5 pkt 14. **Uwaga spec:** wdrożenie po konsultacji prawnej (prawo konsumenckie).
**Zależności:** F12 (credit_purchase), F14 (powiadomienia `refund_confirmed`).
**Zakres:** warianty zwrotu (formuła `(niewykorzystane / zakupione) × price_paid` w integerach), atomowe `available → pending_refund` przy inicjacji; online: Stripe Refund API na Connected Account + webhook `charge.refunded` jako źródło prawdy (błąd API → powrót do `available`); cash: klik admina źródłem prawdy (`refund_confirmed_by_user_id`); pełny z cofnięciem: unieważnienie niewykorzystanych + cofnięcie przyszłych rezerwacji; uprawnienie `refunds.issue`; audyt.
**DoD:** e2e na AC US-18.1–18.3 (webhook offline jak w F10); suita zielona.

---

### Faza 17 — Regulaminy i akceptacje (EPIK 28)

**Status:** nierozpoczęta
**Cel:** wersjonowane regulaminy per typ grupy z zamrożoną akceptacją.
**Pokrywa:** EPIK 28; §2.18; spec §5 pkt 15. **Uwaga:** jeśli którakolwiek akademia wymaga regulaminu prawnie przed startem publicznych zapisów, tę fazę należy wciągnąć przed produkcyjne uruchomienie F5.
**Zależności:** F5 (formularz zapisu); istniejący storage (boilerplate §21) — plik PDF przez `file_id`.
**Zakres:** `policy_document` (wersjonowanie: edycja = nowy rekord), `policy_acceptance` (zamrożona wersja, accepted_at, ip), `group_type.policy_document_id` (nullable → krok pomijany), krok akceptacji w formularzu, wymuszenie re-akceptacji przy nowej wersji (US-28.3/AC2 — **wymaga potwierdzenia prawnego przed implementacją**), historia akceptacji w profilu klienta z linkiem do dokładnej wersji pliku.
**DoD:** e2e na AC US-28.1–28.4; suita zielona.

---

### Faza 18 — Silniki Availability-First i Slot-First + Force Override

**Status:** nierozpoczęta
**Cel:** pozostałe dwa silniki rezerwacji + kontrolowane wymuszanie konfliktu trenera.
**Pokrywa:** §2.1 (AF/SF), EPIK 14.5; spec §5 pkt 16–17.
**Zależności:** F5 (ścieżka rezerwacji), F2 (definicje).
**Zakres:** Availability-First (sesje ręczne `is_recurring=false`, konflikt trenera = Hard Block bez wyjątków); Slot-First (sesja tworzona w locie przy rezerwacji, trener nie wymagany na definicji, rozstrzyga wyłącznie constraint §5.1); `sessions.force_override` (wyłącznie konflikt trenera w Schedule-First, NIGDY capacity — US-14.5; nie ustawia `is_manually_adjusted` — US-3.4/AC10) + audyt każdego użycia.
**DoD:** e2e: AF hard block, SF constraint-only, force override działa dla konfliktu i nie istnieje dla capacity; suita zielona.

---

### Faza 19 — Warunkowe UI formularza + fakturowanie ręczne

**Status:** nierozpoczęta
**Cel:** domknięcie ogona: formularz w pełni odzwierciedla politykę zakupową; administracyjny proces faktur.
**Pokrywa:** spec §5 pkt 18–19; EPIK 27; US-4.4/AC4, US-23.3.
**Zależności:** F12.
**Zakres:** pełne warunkowe renderowanie formularza wg `allowed_purchase_modes`/`allowed_billing_types` (+ komunikat „brak dostępnych pakietów"); żądanie faktury przez klienta (`invoice_requested_at`), lista oczekujących dla recepcji, oznaczenie wystawienia (`invoice_issued_*`, uprawnienie `invoices.mark_issued`); nic z tego nie blokuje ścieżki zakupowej.
**DoD:** e2e na AC EPIK 27 i US-23.3; suita zielona.

---

### Faza 20 — Wynagrodzenia trenerów, wyłącznie informacyjne (EPIK 32, v15)

**Status:** nierozpoczęta
**Cel:** akademia widzi, ile jest winna każdemu trenerowi za wybrany okres; rozliczenie odbywa się poza systemem.
**Pokrywa:** EPIK 32; §2.30; §2.10 (uprawnienia `trainer_rates.manage`, `trainer_earnings.view`); Constraint 8 (§1.3).
**Zależności:** **F6** — kwalifikacja sesji do raportu opiera się na `attendance_status`, więc bez danych frekwencyjnych raport nie ma na czym pracować. Pośrednio F2 (`group_type` dla stawek nadpisujących).
**Zakres:** tabela `trainer_rate` (`organization_id`, `trainer_id`, `group_type_id` nullable, `amount` integer, `effective_from`) + RLS wg wzorca `*_tenant_isolation`/`*_system_bypass` z migracji `0015`; przed dodaniem tabeli **grep po katalogu schematu** pod kątem kolizji nazw eksportów (ryzyko #7, D11); dwa uprawnienia w statycznej mapie RBAC; CRUD stawek dla Owner/Admin (zmiana = nowy rekord z własnym `effective_from`, nigdy UPDATE); raport za zakres dat — suma po sesjach, gdzie trener był prowadzącym ORAZ ≥1 `booking` ma `attendance_status != 'unmarked'`, stawka rozstrzygana wg Constraint 8; ograniczenie trenera do własnych danych egzekwowane na backendzie.
**Świadomie poza zakresem:** jakakolwiek płatność, wypłata, transfer czy operacja na którymkolwiek z dwóch kont Stripe (US-32.5). To kalkulator raportowy, nie payroll.
**DoD:** e2e: admin definiuje stawkę bazową i nadpisanie per typ grupy → raport liczy poprawnie; podniesienie stawki nie zmienia raportu za miniony okres (US-32.2/AC3); sesja bez żadnego oznaczenia obecności nie jest liczona, a sesja z samymi `absent` jest; trener widzi wyłącznie własne dane i dostaje odmowę z backendu przy próbie pobrania cudzych.
**DoD — jawny punkt:** lista sesji **bez rozstrzygniętej stawki** (US-32.3/AC4) jest widoczna **w UI admina** jako wyodrębniona sekcja raportu, nie tylko obecna w strukturze odpowiedzi API. Sesja bez stawki nie może zostać policzona jako zero ani zniknąć z raportu bez śladu — admin ma zobaczyć, że konfiguracja wymaga uzupełnienia.

---

### Faza 21 — Indywidualne ceny klienta (EPIK 33, v15)

**Status:** nierozpoczęta
**Cel:** admin przyznaje wynegocjowany rabat konkretnemu klientowi; rabat stosuje się automatycznie i jest widoczny przed zapłatą.
**Pokrywa:** EPIK 33; §2.31; US-4.2/AC4–AC6; §2.10 (uprawnienie `client_price_override.manage`); Constraint 9 (§1.3).
**Zależności:** **F5** (ścieżka wyliczania `booking.price_snapshot` dla pojedynczych zajęć) oraz **F12** (pakiety i subskrypcje — rabat obejmuje `product_template.price`, w tym `billing_type=recurring`). Pośrednio F3 (encja `client`).
**Rozstrzygnięte (2026-07-19, Rozstrzygnięcie #20 spec):** ad-hoc `price_data` na `subscription_item`, `proration_behavior: none`. Nie blokuje już startu fazy.
**Zakres:** tabela `client_price_override` + RLS wg wzorca z `0015` (grep po katalogu schematu przed dodaniem — ryzyko #7); uprawnienie w statycznej mapie RBAC z wymuszonym `reason`; UI przyznawania **z profilu klienta**, nigdy z `group_type`; wpięcie Constraint 9 w ścieżkę wyliczania ceny — jeden wspólny punkt rozstrzygania dla `booking.price_snapshot` i `credit_purchase.price_paid`, nie dwie równoległe implementacje; wyświetlanie ceny po rabacie na formularzu rejestracji dla rozpoznanego, zweryfikowanego klienta (US-4.2/AC4–AC6); sprawdzenie na żywo przy każdym `invoice.paid` dla subskrypcji; `recordAudit` przy przyznaniu i wyłączeniu; **job synchronizacji ceny subskrypcyjnej** (Rozstrzygnięcie #20), dwa triggery: (a) zmiana `client_price_override`, (b) zmiana `group_type.price`/`product_template.price` dla override'ów `percent_discount` — kolejkowanie per `(client_id, credit_purchase_id)` z `SELECT … FOR UPDATE` na `client_price_override` (Constraint 10); ścieżka Checkoutu początkowego (US-4.2/AC4) budowana od razu przez `price_data`, nigdy przez `product_template.stripe_price_id`, gdy klient ma aktywny override w momencie zakładania subskrypcji.
**Świadomie poza zakresem:** samoobsługowy wniosek o rabat, kod promocyjny, powiadomienie o wygasającym rabacie (§6 spec).
**DoD:** e2e: admin przyznaje rabat (zapis bez `reason` odrzucony) → rozpoznany klient widzi cenę po rabacie na formularzu, niezweryfikowany widzi katalogową → `price_snapshot`/`price_paid` zamrażają cenę po rabacie → wyłączenie rabatu nie rusza historii → odnowienie subskrypcji po `valid_until` nalicza cenę katalogową; **zmiana ceny katalogowej synchronizuje `unit_amount` u klientów z aktywnym `percent_discount`, a NIE rusza klientów z `fixed_price`**; **dwie równoczesne zmiany tej samej pary `(client, credit_purchase)` serializują się bez utraty żadnej z nich (Constraint 10)**; AC z EPIK 33 pokryte; suita zielona.

---

## Ryzyka i otwarte pytania

### Sprzeczności spec ↔ kod (rozstrzygnięte 2026-07-19 — patrz „Rozstrzygnięcia")

- §2.19 zakładał boilerplate'owy magic link → nie istnieje w kodzie → domenowe OTP encji `client` (rewizja 14.1)
- §2.10 zakładał mechanizm ról custom (boilerplate §4.3) → nie istnieje → statyczne role predefiniowane
- RLS: „rekomendacja" w §1.3 vs twarde AC w US-1.1 → pełny RLS (F0 + F1)
- Plany w DB (Zasada #6) vs `plans.ts` w kodzie → F9

### Otwarte pytania (zadać użytkownikowi PRZED wskazaną fazą)

| Pytanie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Kiedy rozstrzygnąć                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ~~Mechanizm sesji klienta: podpisane cookie vs token; czas życia; wylogowanie~~ — **rozstrzygnięte 2026-07-20 (D37):** opaque token w tabeli `client_session` + cookie, TTL 30 dni przedłużany, izolacja przez `organization_id` w bazie. Patrz F3                                                                                                                                                                                                                                                                                           | start F3                                    |
| ~~**Routing subdomenowy** (rewizja 15.1, §2.27)~~ — **rozstrzygnięte i zbudowane w F4.5 (2026-07-20).** Rozpoznanie tenanta z `Host` w `src/proxy.ts`, jedno źródło listy zarezerwowanych prefiksów (`src/features/cms/reserved-slugs.ts`), szew dla stron CMS, `localtest.me` w dev/e2e. **EPIK 4 i moduł CMS są odblokowane.** Poza zakresem F4.5 i nadal otwarte: (a) **migracja panelu** `/orgs/[slug]/…` → `/dashboard/…` → wydzielona do **F4.6**; (b) **domeny własne przez CNAME i wildcard TLS** → bez fazy docelowej, patrz Ryzyka | zamknięte                                   |
| Los `src/features/billing/plans.ts` i tabeli cen na landing po przejściu na plany w DB                                                                                                                                                                                                                                                                                                                                                                                                                                                       | start F9                                    |
| Próg ostrzegawczy 90% dla `plan_limit_approaching` — globalny czy per `limit_key` (spec §8 pkt 7)                                                                                                                                                                                                                                                                                                                                                                                                                                            | przed US-29.3 (F9/F14)                      |
| Wymuszenie re-akceptacji regulaminu przy nowej wersji (US-28.3/AC2) — potwierdzenie prawne                                                                                                                                                                                                                                                                                                                                                                                                                                                   | przed F17                                   |
| Formuła zwrotu przy przyszłych promocjach/cenach warstwowych (spec §8 pkt 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | przy wprowadzaniu promocji; nie blokuje F16 |
| Zwrot `price_difference < 0` w swapie: zależność F15 od F16 czy wspólny mechanizm budowany w F15                                                                                                                                                                                                                                                                                                                                                                                                                                             | start F15                                   |

### Ryzyka techniczne

- **RLS + pooling połączeń:** wzorzec ustalony w F0 i gotowy do skopiowania w F1: `withTenant` (`src/lib/db/tenant.ts`) używa `set_config('app.organization_id', …, true)` — funkcji, nie `SET LOCAL`, bo `SET LOCAL` nie przyjmuje placeholdera i wymuszałby sklejanie stringa z `orgId`. Trzeci argument `true` = zasięg transakcji; `false` dałoby zasięg sesji i wyciek kontekstu przez pulę (pokryte osobnym testem). Bypass: `withSystemBypass` ogrodzony `no-restricted-imports`. **Zamknięte w F1a dla ścieżek żądań:** retrofit dotknął 15 sygnatur DAL-i i ~26 call site'ów, a `features/admin/{data,actions}.ts`, `storage/purge.ts` i `onboarding/data.ts` dostały jawne wyjątki w ESLint (5 łącznie, każdy z uzasadnieniem w nagłówku bloku). `withOwner` dodał drugi GUC `app.account_id` i zasadę „zawsze oba GUC-i" — patrz D14/D15. **Zamknięte w F1b dla tabel billingowych:** bypass okazał się węższy, niż zakładał plan — jeden odczyt (`findBillingCustomer`) w jednym ogrodzonym pliku, a cała ścieżka zapisu webhooka biegnie pod `WITH CHECK` (D23/D24). Retrofit RLS jest tym samym domknięty: nie ma już tabeli tenantowej poza polityką, poza jawnie odnotowanymi carve-outami (D17/D18).

- **`ON CONFLICT` pod RLS (ujawnione w F1b, dotyczy każdego przyszłego upserta):** `DO NOTHING` sprawdza wyłącznie `WITH CHECK` INSERT-a i pozostaje cichym no-opem; `DO UPDATE` na wiersz niewidoczny pod USING **rzuca `42501`** („the UPDATE path will never be silently avoided"); `setWhere` jest ewaluowany przed USING, więc sygnał „stale" jest nietknięty. Istotne dla F9 (mapowanie plan-id), F11/F12 (webhooki kredytowe) i F16 (zwroty) — wszystkie w kształcie `ON CONFLICT`. Opis w `ARCHITECTURE.md` („RLS and `ON CONFLICT`").
- **`FORCE ROW LEVEL SECURITY` a backfille w migracjach (ujawnione w F0):** przy `FORCE` migracja podlega politykom, chyba że rola migracyjna ma BYPASSRLS. Ma ją (jest superuserem w dev/CI), ale jeśli to się zmieni, `UPDATE` w backfillu trafi zero wierszy i **nie zgłosi błędu** — migracja przejdzie, dane nie. W F1a nie wystąpiło (brak backfillu — patrz bramka 8.0 i wpis o niej wyżej); istotne przy każdej przyszłej migracji, która łączy `FORCE` z backfillem.
- **⚠️ BLOKUJĄCE PRZED PIERWSZYM WDROŻENIEM WIELOINSTANCYJNYM (ujawnione w F1a): `db:migrate` nie jest krokiem deploya.** Ustalone: `"build": "next build"`, jedyne automatyczne uruchomienie migracji to `.github/workflows/ci.yml:135` przeciwko efemerycznej bazie testowej, `vercel.json` zawiera tylko crona. Migracja produkcyjna jest więc **osobną, ręczną operacją poza deployem**, a Vercel przełącza ruch stopniowo. Dla migracji RLS kolejność jest asymetryczna i krytyczna: **migracja przed kodem = pełna awaria zalogowanej aplikacji** (stary kod czyta `membership` bez kontekstu → zero wierszy → `forbidden()`, każdy tenant, bez trybu częściowej degradacji); **kod przed migracją = brak zmiany zachowania** (nowy kod ustawia GUC-i, których żadna tabela jeszcze nie czyta). Runbook w `ARCHITECTURE.md` („Deploying an RLS migration"). Dopóki krok migracji nie jest zautomatyzowany po pełnej promocji deploymentu, ta kolejność jest **gwarantowana wyłącznie dyscypliną operatora, nie narzędziem**. Do rozstrzygnięcia przed pierwszym wdrożeniem na środowisko z >1 instancją; nie blokuje pracy na dev/CI. Dotyczy tak samo F1b.
- **Bramka danych przed każdym `FORCE` (wzorzec z F1a):** wiersz bez właściciela nie staje się błędem, tylko **cicho niewidocznym wierszem**. Przed włączeniem polityki na nowej tabeli policzyć wiersze bez właściciela — **na roli właściciela i PRZED migracją**. Na `DATABASE_URL` po migracji zapytanie zwróci `0` niezależnie od stanu danych, bo to dokładnie te wiersze, które polityka ukrywa. Zero odczytane z niewłaściwej strony przełącznika jest zerem bez treści.
- **⚠️ Migracja może zostać CICHO POMINIĘTA, a `db:migrate` zgłosi sukces (ujawnione w F2).** Drizzle stosuje wyłącznie migracje, których `when` w `meta/_journal.json` jest **większe** niż ostatnio zastosowane — nie te, których brakuje w tabeli `__drizzle_migrations`. Migracje pisane ręcznie (`0012`, `0015`–`0017`) mają `when` wpisane z palca; `0017_rls_billing` dostało stempel 2026-07-20 15:02, a wygenerowane później `0018` — 06:25 tego samego dnia. Efekt: `0018` **nigdy się nie wykonało**, a polecenie wypisało „migrations applied successfully". Objaw był odległy od przyczyny (`column "description" does not exist` w runtime, przy zielonym `db:migrate`). Naprawione przez podniesienie `when` w journalu; zweryfikowane od zera (19/19). **Powtórzyło się w F3 (D46) i w F4 (D51)** — trzy fazy z rzędu, za każdym razem złapane wyłącznie ręcznym sprawdzeniem journala przed uruchomieniem. Skoro pułapka wraca deterministycznie przy każdej fazie dokładającej migrację, rozważyć skrypt sprawdzający monotoniczność `when` jako krok `quality` w CI zamiast polegać na pamięci operatora. **Reguła na dziś: po każdym `db:generate` sprawdzić, czy `when` nowego wpisu jest większe od wszystkich poprzednich** — zwłaszcza gdy w historii są migracje ręczne. Wersja produkcyjna tego błędu jest gorsza niż w dev: kod trafia na produkcję zakładając kolumnę, której nie ma, a krok migracji raportuje sukces.
- **`drizzle-kit push` skasowałby całą ochronę:** EXCLUDE, polityki RLS i GRANT-y żyją wyłącznie w ręcznym SQL i są niewidoczne dla snapshotu Drizzle. `generate` ich nie ruszy (diffuje TS wobec snapshotu), ale `push` introspektuje żywą bazę i zaproponuje ich DROP. Zakaz udokumentowany w ARCHITECTURE.md; skryptu `db:push` nie ma i nie wolno go dodać.
- **Kolizje nazw eksportów w `schema/index.ts` są ciche:** `export *` z dwóch modułów eksportujących tę samą nazwę nie jest błędem — nazwa staje się niejednoznaczna i zostaje pominięta, a drizzle-kit generuje wtedy FK wskazujący na _inną_ tabelę o tej nazwie. Zdarzyło się raz (`session` ↔ Better Auth, D11). Przed dodaniem tabeli: grep po katalogu schematu.
- **Dług routingu z Fazy 2 — NADAL OTWARTY, przypisany do F4.6 (stan na 2026-07-20):** UI CRUD lokalizacji/typów grup/wzorców/grafiku żyje pod `/orgs/[slug]/…`. F4.5 świadomie go **nie** spłaciła: migracja panelu dotyka `requireOrgAccess` (chokepoint każdej strony i akcji org), ~6 speców e2e i `context-switch.spec.ts` testujący przełącznik organizacji, który wg §2.19 wyjątek #5 ma zniknąć — czyli druga decyzja produktowa, nie efekt uboczny routingu. Do czasu F4.6 `/orgs/[slug]/…` jest jedynym działającym mechanizmem panelu i **jest chroniony przed pomyłką**: prefiksy `dashboard`/`orgs`/`login` mają w `reserved-slugs.ts` znacznik `stage: "apex"`, więc wejście na nie z hostu akademii przekierowuje na apeks zamiast wpadać w pętlę logowania (D60). F4.6 to flip znacznika plus przeniesienie folderów.
- ~~**Dług adresowania z Fazy 3**~~ — **spłacony w F4.5 (2026-07-20).** Zakład z D39 wyszedł dokładnie tak, jak zaprojektowano: zmiana polegała na **usunięciu pola** z czterech kontraktów tras, a `findOrganizationBySubdomain` i wszystko za nim pozostało nietknięte. Kod błędu (`unknown_organization`, 404) też się nie zmienił. Gdyby trasy przyjmowały `organizationId`, byłoby to przeprojektowanie.
- **URL-e absolutne zakotwiczone w apeksie build-time (ujawnione w F4.5):** `NEXT_PUBLIC_APP_URL` jest inline'owany przy buildzie, więc jeden obraz nie może być kanoniczny dla wielu hostów. Dziś nieszkodliwe — panel personelu nadal żyje na apeksie, linki w mailach tam prowadzą, a strony akademii to 404 bez czego kanonikalizować. Przestaje być nieszkodliwe w **F4.6** (przenosiny panelu → linki weryfikacyjne i zaproszenia muszą iść za hostem) i w **module CMS** (canonical/sitemap per tenant). Oba wymagają request-aware wariantu `absoluteUrl()`. Uwaga: redirecty w `src/proxy.ts` budowane przez `new URL(…, request.url)` **już** podążają za `Host` — problem dotyczy wyłącznie URL-i budowanych z env.
- **`BETTER_AUTH_URL` jako jedna stała (F4.6):** w F4.5 auth personelu jest wyłącznie na apeksie (D60), więc `baseURL` i host się zgadzają i nic nie jest zepsute. §2.19 wyjątek #5 wymaga cookie scoped per host — to **domyślne** zachowanie Better Auth, więc model docelowy nie wymaga zmiany mechanizmu cookie, tylko `baseURL` zależnego od hosta żądania.
- **Domeny własne akademii (CNAME) — punkt otwarty, bez fazy docelowej:** `parseHost` zwraca dziś `foreign` dla hosta spoza `APP_ROOT_DOMAIN` i to jest punkt rozszerzenia. Domena własna to lookup po **pełnym hoście**, nie po etykiecie — będzie wymagała kolumny i **wtedy** migracji, plus wildcard TLS i weryfikacji własności domeny.
- **E2E zależy od publicznego DNS (F4.5):** suita adresuje hosty tenantów przez `*.localtest.me`, które rozwiązuje się przez publiczny DNS na 127.0.0.1. Runner bez egressu DNS **nie pada szybko** — każda nawigacja tenantowa wisi do timeoutu i raportuje się jako seria niepowiązanych flake'ów. Stąd krok `getent hosts probe.localtest.me` w CI **przed** Playwrightem. Subdomeny są mintowane per test, więc statyczny `/etc/hosts` nie jest fallbackiem; realnym byłoby `--host-resolver-rules` w Chromium.
- **Testy zależne od kolejki są niestabilne przy `fullyParallel` na świeżej bazie (zmierzone w F4.5, WCZEŚNIEJSZE):** `langlion-schedule` (generowanie sezonu jobem) i część speców mailowych bywają czerwone przy równoległym starcie na pustej bazie. Pomiar: `--repeat-each=3` na `langlion-schedule` → **6/33 porażek na kodzie bez F4.5**, **3/33 z F4.5**. W konfiguracji CI (`--workers=1`) suita jest zielona, więc bramka merge'a jest wiarygodna, ale **lokalny przebieg `pnpm test:e2e` na świeżo zresetowanej bazie potrafi być czerwony bez związku ze zmianą, którą się właśnie testuje**. Przed uznaniem porażki za regresję: powtórzyć na `--workers=1` albo porównać z baseline'em na zastashowanych zmianach. Osobna, powiązana lekcja: **spec, który masowo kolejkuje maile, głodzi kolejkę pozostałych speców** — pierwsza wersja testu D61 wysyłała 21 OTP i wywracała niepowiązane testy.
- **Nazwy subdomen w E2E muszą być legalnymi etykietami DNS (D63):** `uniqueId` z `billing-fixtures` łączy **podkreślnikami**, których `SUBDOMAIN_PATTERN` nie dopuszcza — taki host parsuje się jako `foreign` i odpowiada 404 `unknown_organization`. Do seedowania subdomen służy `uniqueSubdomain` z `host-fixtures`. Objaw (zepsuty lookup) jest odległy od przyczyny (nieprawidłowa nazwa).
- **Vercel Hobby = cron dzienny:** mechanizmy czasowe (wygaszanie wniosków po 24h, expiry kredytów, generowanie sezonu, retry jobów) wymagają w produkcji zewnętrznego pingera `/api/cron/jobs` albo planu Pro (patrz ARCHITECTURE.md „Background jobs in production").
- ~~**Denormalizacja `booking.session_start_time/end_time`**~~ — **zdjęte w F0 (decyzja D4).** Złożony FK `booking (sessionId, organizationId, sessionStartTime, sessionEndTime) → class_session (id, organizationId, startTime, endTime) ON UPDATE CASCADE` utrzymuje denorm na poziomie schematu. Ścieżki edycji czasu (F2/F8/F18) nie muszą już o tym pamiętać, a przesunięcie łamiące §5.3 wywala własną transakcję — dając „pomiń tę jedną sesję" z US-3.4/AC7 bez dodatkowej logiki. Zweryfikowane testem.
- **Dwa konta Stripe (Zasada #7):** każde utworzenie PaymentIntent/Subscription/Price musi jawnie wskazywać konto docelowe (parametr obowiązkowy w rozszerzonym kontrakcie adaptera, bez wartości domyślnej) — pomyłka platform↔connect to błąd krytyczny; stąd F9 i F10 jako osobne, wąskie fazy i testy jednostkowe rozróżnienia w F10.
- **Strefy czasowe (US-1.2):** generowanie sesji w lokalnej strefie akademii z konwersją do UTC wokół zmian czasu (marzec/październik) — pokryte testem jednostkowym w F0, ale każda nowa logika dat musi go respektować.
- **Konflikt trenera przed F18:** do czasu Force Override edycja wzorca kolidująca z grafikiem trenera jest twardo blokowana (US-3.4/AC5 realizowane w pełni dopiero w F18) — świadome, tymczasowe zawężenie.
- **Rabat klienta na subskrypcji a model cen Stripe (v15):** Rozstrzygnięcie #17 specyfikacji wymaga, aby kwota kolejnego cyklu zależała od stanu `client_price_override` **w momencie odnowienia**. `product_template.stripe_price_id` to stała cena na Connected Account i tego nie wyrazi. Ryzyko materializuje się wcześniej niż F21: jeśli **F12** zbuduje ścieżkę checkoutu pakietowego wyłącznie wokół gotowego `stripe_price_id`, F21 wymusi jej przeprojektowanie zamiast rozszerzenia. Przy projektowaniu F12 zostawić miejsce na cenę ad-hoc lub `coupon` — decyzja zapadła (Rozstrzygnięcie #20): ad-hoc `price_data`. F12 musi budować ścieżkę checkoutu pakietowego tak, by dopuszczała `price_data` jako alternatywę dla `stripe_price_id` już od startu, nie dopiero w F21 — inaczej F21 wymusi przeprojektowanie zamiast rozszerzenia (ryzyko pozostaje aktualne, zmienia się tylko z „nierozstrzygnięte" na „rozstrzygnięte, do uwzględnienia w F12").
