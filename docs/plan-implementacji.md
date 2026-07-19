# Plan implementacji: langlion (Moduł Grup i Rezerwacji)

**Utworzono:** 2026-07-19
**Podstawa:** `docs/specyfikacja.md` — wersja dokumentu 14, rewizja 14.1 (encja `client`)
**Specyfikacja fundamentu:** `docs/boilerplate-spec.md` (odwołania „boilerplate §X")
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

**Status:** nierozpoczęta
**Cel:** encje rdzenia z ochroną współbieżności na poziomie bazy i RLS jako drugą linią obrony; uporządkowana dokumentacja. Backend-only (bez UI) — nie zmienia zachowania istniejącego produktu.
**Pokrywa:** spec §5 pkt 1–2; EPIK 1 (US-1.1, US-1.2); Zasady nadrzędne #1–#3 (fundament pod nie); §2.14 (kwoty integer od startu).
**Zależności:** brak (fundament boilerplate istnieje).

**Zadania:**

1. **Dokumenty** *(część wykonana 2026-07-19 przy tworzeniu tego planu)*:
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

---

### Faza 1 — ⚠️ RLS retrofit tabel tenantowych boilerplate'u

**Status:** nierozpoczęta
**Cel:** rozszerzenie drugiej linii obrony (RLS) na istniejące tabele tenantowe boilerplate'u. Wąska, ryzykowna — dotyka współdzielonej infrastruktury danych.
**Pokrywa:** US-1.1/AC1 w pełnym zakresie; boilerplate §11.2 (rekomendacja RLS).
**Zależności:** F0 (infrastruktura RLS: rola, wrapper, wzorzec polityk).
**Zakres:** polityki RLS + FORCE na `membership`, `invitation`, `file`, `notification`, `billing_customer`, `subscription`, `billing_payment`, `webhook_event`, `personal_account` (właściciel XOR wymaga polityk dwugałęziowych org/account); przegląd DAL-i pod kątem transakcyjnego kontekstu; jawny bypass dla `features/admin/data.ts` (cross-tenant by design), jobów systemowych i webhooków. Tabele systemowe (auth, `audit_log`, `job`, `email_suppression`, `rate_limit`) świadomie POZA RLS — zgodnie z regułą wyjątków w `ARCHITECTURE.md`.
**DoD:** polityki aktywne na wszystkich tabelach tenantowych; testy izolacji cross-tenant dla tabel boilerplate'u; CAŁA istniejąca suita e2e zielona (admin, billing webhooki, notyfikacje, storage, joby — to jest właściwy test tej fazy).

---

### Faza 2 — Schedule-First: definicje, wzorce, generowanie sezonu (panel akademii)

**Status:** nierozpoczęta
**Cel:** admin akademii tworzy lokalizacje, typy grup i wzorce; zapis wzorca cyklicznego generuje sezon; edycja wzorca w sezonie działa bezpiecznie.
**Pokrywa:** EPIK 2, 3, 22 (część administracyjna); §2.1 (silnik Schedule-First), §2.2, §2.12; §2.10 (role i uprawnienia domenowe — pierwsza partia).
**Zależności:** F0.
**Zakres:** rozszerzenie mapy RBAC o role `reception`/`trainer`/`secretariat` i uprawnienia `group_types.manage`, `sessions.generate_season`, `sessions.manage`, `locations.manage` (Rozstrzygnięcie #4); UI CRUD w `/orgs/[slug]/…` za `requireOrgPermission`; job `sessions.generate` (idempotentny przez unique §4.4, dogenerowuje wyłącznie brakujące); edycja wzorca w sezonie: UPDATE przyszłych nieodbytych sesji z `SELECT … FOR UPDATE` per sesja, pominięcie `is_manually_adjusted`, aktualizacja denorm czasów w `booking` w tej samej tx, lista pominiętych z powodem (US-3.4 AC1–AC10; powiadomienia klientów = e-mail, Rozstrzygnięcie #3); grafik/lista sesji z filtrem lokalizacji; konflikt trenera przy generowaniu/edycji = twarda blokada (Force Override dopiero F18); audyt zmian przez `recordAudit`.
**DoD:** e2e: pełny przepływ admina (lokalizacja → typ → wzorzec → sezon w tle → przedłużenie bez duplikatów → edycja godziny/lokalizacji w sezonie z pominięciem ręcznie skorygowanej sesji); AC z US-2.x, US-3.x, US-22.1–22.4 (część admin) pokryte; suita zielona.

---

### Faza 3 — ⚠️ Tożsamość klienta: encja client + OTP + sesja klienta (odejście #2)

**Status:** nierozpoczęta
**Cel:** klient istnieje jako domenowa tożsamość per akademia i umie się uwierzytelnić kodem OTP.
**Pokrywa:** EPIK 4 (US-4.2, US-4.5), §2.8, §2.19 (rewizja 14.1).
**Zależności:** F0 (tabela `client` istnieje).
**Zakres:** tabela tokenów OTP (hash, TTL ~15 min, jednorazowość, scoped `(organization_id, email)` — wzorzec `invitations.ts`); wysyłka kodu przez `enqueueEmail` (nowy szablon); rate limit na wydawanie/weryfikację OTP (istniejący adapter rate-limit); **projekt sesji klienta do rozstrzygnięcia na starcie fazy** (otwarte pytanie: podpisane cookie per org vs token — patrz „Ryzyka"); publiczny layout kliencki (poza `(app)`, w `public-routes`); rozpoznanie zweryfikowanego klienta wyłącznie w obrębie organizacji (§2.8); upsert `client` + `is_verified` flip po OTP.
**DoD:** e2e: nowy e-mail dostaje OTP i po weryfikacji ma sesję kliencką w akademii A, a ten sam e-mail w akademii B jest obcy (pełna izolacja); kod jednorazowy i wygasający; rate limit działa; suita zielona.

---

### Faza 4 — System kredytowy (silnik)

**Status:** nierozpoczęta
**Cel:** kredyt jako jedyna waluta rozliczeniowa (Zasada #2) — silnik bez UI klienckiego.
**Pokrywa:** EPIK 7 (US-7.1–7.4), §2.4; EPIK 20 częściowo (soft delete `credit_type`).
**Zależności:** F0, F2 (`group_type` dla `credit_type.group_type_id` 1:1).
**Zakres:** tabele `credit_type` (1:1 z group_type), `credit` (statusy, source, valid_until liczony w `organization.timezone`, athlete_id nullable = portfel rodzinny, FK źródeł) + FK `booking.consumed_credit_id`; konsumpcja FIFO atomowa (`SELECT … FOR UPDATE SKIP LOCKED`, filtr `status='available'`, priorytet dopasowania konkretnego dziecka przed rodzinnym) w jednej transakcji z bookingiem; `manual_admin_grant` z wymaganym powodem + `recordAudit` (uprawnienie `credits.manual_grant`); cron wygaszania (`expired`) po `valid_until`; RLS na nowych tabelach.
**DoD:** testy: FIFO wybiera najwcześniej wygasający; równoległa konsumpcja ostatniego kredytu — wygrywa jedna transakcja (US-7.2); grant bez powodu odrzucony + wpis audytu przy sukcesie; wygasanie w strefie organizacji; suita zielona.

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
**Pokrywa:** EPIK 6 (US-6.1, US-6.3), EPIK 16; §2.10 (uprawnienia `credits.confirm_on_site`).
**Zależności:** F5.
**Zakres:** widoki listy sesji/uczestników dla ról trainer/reception (statusy kolorami: `confirmed` zielony, `booked_offline` żółty); akcja „Zatwierdź gotówkę" → w jednej transakcji kredyt `on_site_payment` generowany + konsumowany + `booking → confirmed` + `recordAudit` (kto/kiedy/która rezerwacja); `no_show` bez automatycznych konsekwencji; brak automatycznego zwalniania miejsca przy braku zapłaty (US-6.2).
**DoD:** e2e: recepcja zatwierdza gotówkę → status i audyt; trener widzi statusy, ale bez uprawnienia nie zatwierdza; suita zielona.

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

## Ryzyka i otwarte pytania

### Sprzeczności spec ↔ kod (rozstrzygnięte 2026-07-19 — patrz „Rozstrzygnięcia")

- §2.19 zakładał boilerplate'owy magic link → nie istnieje w kodzie → domenowe OTP encji `client` (rewizja 14.1)
- §2.10 zakładał mechanizm ról custom (boilerplate §4.3) → nie istnieje → statyczne role predefiniowane
- RLS: „rekomendacja" w §1.3 vs twarde AC w US-1.1 → pełny RLS (F0 + F1)
- Plany w DB (Zasada #6) vs `plans.ts` w kodzie → F9

### Otwarte pytania (zadać użytkownikowi PRZED wskazaną fazą)

| Pytanie | Kiedy rozstrzygnąć |
|---|---|
| Mechanizm sesji klienta: podpisane cookie scoped per organizacja vs token; czas życia; wylogowanie | start F3 |
| Los `src/features/billing/plans.ts` i tabeli cen na landing po przejściu na plany w DB | start F9 |
| Próg ostrzegawczy 90% dla `plan_limit_approaching` — globalny czy per `limit_key` (spec §8 pkt 7) | przed US-29.3 (F9/F14) |
| Wymuszenie re-akceptacji regulaminu przy nowej wersji (US-28.3/AC2) — potwierdzenie prawne | przed F17 |
| Formuła zwrotu przy przyszłych promocjach/cenach warstwowych (spec §8 pkt 1) | przy wprowadzaniu promocji; nie blokuje F16 |
| Zwrot `price_difference < 0` w swapie: zależność F15 od F16 czy wspólny mechanizm budowany w F15 | start F15 |

### Ryzyka techniczne

- **RLS + pooling połączeń:** `SET LOCAL` działa tylko w transakcji — każdy odczyt/zapis tenantowy langlion musi iść przez transakcyjny wrapper; retrofit boilerplate'u (F1) dotknie wielu DAL-i; ścieżki cross-tenant (super admin, joby, webhooki) wymagają jawnego, udokumentowanego bypassu. To największe ryzyko regresji w całym planie — stąd F1 jako osobna faza z pełną suitą e2e jako kryterium.
- **Vercel Hobby = cron dzienny:** mechanizmy czasowe (wygaszanie wniosków po 24h, expiry kredytów, generowanie sezonu, retry jobów) wymagają w produkcji zewnętrznego pingera `/api/cron/jobs` albo planu Pro (patrz ARCHITECTURE.md „Background jobs in production").
- **Denormalizacja `booking.session_start_time/end_time`:** każda nowa ścieżka edycji czasu sesji MUSI aktualizować denorm w tej samej transakcji (US-14.3/AC3) — łatwe do pominięcia; egzekwować review-checklistą przy F2/F8/F18.
- **Dwa konta Stripe (Zasada #7):** każde utworzenie PaymentIntent/Subscription/Price musi jawnie wskazywać konto docelowe (parametr obowiązkowy w rozszerzonym kontrakcie adaptera, bez wartości domyślnej) — pomyłka platform↔connect to błąd krytyczny; stąd F9 i F10 jako osobne, wąskie fazy i testy jednostkowe rozróżnienia w F10.
- **Strefy czasowe (US-1.2):** generowanie sesji w lokalnej strefie akademii z konwersją do UTC wokół zmian czasu (marzec/październik) — pokryte testem jednostkowym w F0, ale każda nowa logika dat musi go respektować.
- **Konflikt trenera przed F18:** do czasu Force Override edycja wzorca kolidująca z grafikiem trenera jest twardo blokowana (US-3.4/AC5 realizowane w pełni dopiero w F18) — świadome, tymczasowe zawężenie.
