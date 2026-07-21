### Faza 20 — Wynagrodzenia trenerów, wyłącznie informacyjne (EPIK 32, v15)

**Status:** nierozpoczęta
**Cel:** akademia widzi, ile jest winna każdemu trenerowi za wybrany okres; rozliczenie odbywa się poza systemem.
**Pokrywa:** EPIK 32 (w tym **US-32.6, v17 — stawka godzinowa**); §2.30, **§2.37**; §2.10 (uprawnienia `trainer_rates.manage`, `trainer_earnings.view`); Constraint 8 (§1.3).
**Zależności:** **F6** — kwalifikacja sesji do raportu opiera się na `attendance_status`, więc bez danych frekwencyjnych raport nie ma na czym pracować. Pośrednio F2 (`group_type` dla stawek nadpisujących).
**Zakres:** tabela `trainer_rate` (`organization_id`, `trainer_id`, `group_type_id` nullable, `amount` integer, `effective_from`, **`rate_type` enum `flat_per_session`\|`hourly` default `flat_per_session` — v17**) + RLS wg wzorca `*_tenant_isolation`/`*_system_bypass` z migracji `0015`; przed dodaniem tabeli **grep po katalogu schematu** pod kątem kolizji nazw eksportów (ryzyko #7, D11); dwa uprawnienia w statycznej mapie RBAC; CRUD stawek dla Owner/Admin (zmiana = nowy rekord z własnym `effective_from`, nigdy UPDATE); raport za zakres dat — suma po sesjach, gdzie trener był prowadzącym ORAZ ≥1 `booking` ma `attendance_status != 'unmarked'`, stawka rozstrzygana wg Constraint 8; **kwota sesji liczona wg `rate_type` wygrywającego wiersza `trainer_rate`: `flat_per_session` = `amount`, `hourly` = `amount × (end_time - start_time)`** (§2.37, US-32.6); ograniczenie trenera do własnych danych egzekwowane na backendzie.
**Zakres dołożony w v17 (poprawka #9, stawka godzinowa):** `rate_type` per `trainer_rate` (Rozstrzygnięcie #28 spec — nie per trener globalnie), wchodzi **od razu z pierwszą migracją `trainer_rate`** (nie osobna migracja additive), bo tabela i tak powstaje tu po raz pierwszy. Zmienia wyłącznie **przeliczenie kwoty** — nie wersjonowanie, nie kwalifikację sesji, nie Constraint 8.
**Świadomie poza zakresem:** jakakolwiek płatność, wypłata, transfer czy operacja na którymkolwiek z dwóch kont Stripe (US-32.5). To kalkulator raportowy, nie payroll.
**DoD:** e2e: admin definiuje stawkę bazową i nadpisanie per typ grupy → raport liczy poprawnie; podniesienie stawki nie zmienia raportu za miniony okres (US-32.2/AC3); sesja bez żadnego oznaczenia obecności nie jest liczona, a sesja z samymi `absent` jest; trener widzi wyłącznie własne dane i dostaje odmowę z backendu przy próbie pobrania cudzych.
**DoD — jawny punkt:** lista sesji **bez rozstrzygniętej stawki** (US-32.3/AC4) jest widoczna **w UI admina** jako wyodrębniona sekcja raportu, nie tylko obecna w strukturze odpowiedzi API. Sesja bez stawki nie może zostać policzona jako zero ani zniknąć z raportu bez śladu — admin ma zobaczyć, że konfiguracja wymaga uzupełnienia.
**DoD — v17 (stawka godzinowa, US-32.6):** raport liczy poprawnie oba `rate_type` dla tego samego trenera — sesja 90 min z `hourly` = `amount × 1,5`, sesja z `flat_per_session` = `amount` niezależnie od długości; podniesienie stawki godzinowej od nowego sezonu nie zmienia raportu za miniony okres (nieretroaktywność jak dla ryczałtu).

**⚠️ Blast radius (poprawka #9 — stawka godzinowa):**
- **Zakończone fazy do ponownego dotknięcia:** **ŻADNA** — `trainer_rate` nie istnieje jeszcze w schemacie (F20 nierozpoczęta). Najtańsza z sześciu poprawek: czysto dokładający zakres jednej, jeszcze nieotwartej fazy; kolumna `rate_type` wchodzi z pierwszą migracją `trainer_rate`, bez osobnej migracji additive.
- **Nierozpoczęte fazy rosnące bez ryzyka retrofitu:** wyłącznie F20 (rośnie w miejscu).

---

