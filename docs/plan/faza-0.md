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

