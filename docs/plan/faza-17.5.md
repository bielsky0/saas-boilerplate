### Faza 17.5 — Dyspozycyjność trenerów (EPIK 34, v16)

**Status:** nierozpoczęta
**Cel:** model dostępności trenera jako warstwa podpowiedzi slotów dla silników AF/SF; realne sloty w Slot-First zamiast zgadywania; §5.1 pozostaje jedyną ochroną przed kolizją.
**Pokrywa:** EPIK 34; §2.32; Constraint 11; spec §5 pkt „15a".
**Zależności:** F0 (tabele/RLS/`withTenant`), F2 (`group_type` — kolumny `default_*`), F5 (ścieżka rezerwacji). **F18 jest rewidowana tak, by od tej fazy zależeć** (silniki wpinają się w dostępność).
**Powód wstawienia fazy (wzorzec F4.5/F4.6):** dyspozycyjność to model danych + warstwa liczenia slotów, którą Slot-First (F18) konsumuje; wciąganie jej do fazy o silnikach zlałoby dwie decyzje (model dostępności vs zachowanie silników). Osobna, wąska faza przed F18.
**Zakres:** tabela `trainer_availability` (`organization_id`, `trainer_id`, `day_of_week`, `start_time`, `end_time`, `location_id` nullable, `is_active`) + kolumny `group_type.default_duration_minutes`/`default_capacity` (migracja additive); RLS wg wzorca `*_tenant_isolation`/`*_system_bypass` z migracji `0015`; **grep po katalogu schematu pod kątem kolizji nazw eksportów przed dodaniem tabeli** (ryzyko „kolizje nazw eksportów", D11); uprawnienie `trainer_availability.manage` w statycznej mapie RBAC (Rozstrzygnięcie #4); **czysta funkcja liczenia slotów** (Constraint 11: okna dostępności ∨ domyślne godziny pracy MINUS istniejące `class_session` trenera, pocięte co `default_duration_minutes`) — wzorzec `bookings/calendar.ts`/Vitest, bez importu env (jak `parseHost`/D62); fail-safe granica domyślna (godziny pracy — kolumna → Otwarte pytania; na start literał/TODO z odnośnikiem do otwartego punktu, **nie DEFAULT łamiący konwencję** — jak `subdomain`/`currency` w §1.2); CRUD dostępności w panelu za `requireOrgPermission`. **Uwaga do migracji:** sprawdzić monotoniczność `when` w `meta/_journal.json` **przed** `db:migrate` (pułapka D46/D51/D67).
**DoD:** Vitest/e2e: sloty = dostępność MINUS istniejące sesje, pocięte co `default_duration_minutes`; **brak dostępności → domyślne godziny pracy, nie doba** (fail-safe); dwa zapisy na ten sam podpowiedziany slot → §5.1 daje dokładnie jeden sukces (nie warstwa podpowiedzi); AF poza oknem = ostrzeżenie, nie blokada; kolizja trenera nadal twardo blokowana; suita zielona.

---

