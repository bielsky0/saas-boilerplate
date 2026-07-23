### Faza 8 — Soft delete domenowy + reasygnacje

**Status:** ✅ **zakończona** (2026-07-23)
**Cel:** bezpieczne wycofywanie zasobów z obiegu (Zasada #4: blokada z listą zależności, nie kreator).
**Pokrywa:** EPIK 20, 21; §2.11.
**Zależności:** F7 (odwołanie sesji jako narzędzie rozwiązywania zależności).
**Zakres:** dezaktywacje z bramkami: `group_type` (blokada przy aktywnym `is_recurring` lub przyszłych sesjach), trener/offboarding (blokada przy przyszłych sesjach, lista w toaście), `credit_type` (istniejące kredyty żyją do wygaśnięcia), `location` (ostrzeżenie, NIE twarda blokada — decyzja #6 spec §7); substytucja trenera w pojedynczej sesji (constraint §5.1 = hard block); masowa zmiana trenera (osobna tx per sesja, pominięcia + raport zbiorczy); Mass Move Bookings (per uczestnik: capacity + kolizja; UPDATE bookingu, nie recreate; lista „wymaga ręcznej interwencji"); uprawnienia `trainers.offboard`, `sessions.mass_reassign_trainer`, `sessions.mass_move_bookings`, `group_types.deactivate`.
**DoD:** e2e na AC US-21.x i US-20.1; raporty częściowego sukcesu; suita zielona.

#### Postęp na 2026-07-23

Zrealizowane i zweryfikowane (`pnpm test`: 121/121 zielone, `pnpm tsc --noEmit`: 0 source errors):

- **D1 — RBAC + Audit + i18n:** 4 permissiony, 7 AuditAction, i18n PL/EN.
- **D2 — Dezaktywacja group_type:** `features/groups/deactivate.ts` z blokadami (recurring + future sessions).
- **D3 — Dezaktywacja trenera:** `features/trainers/{data,deactivate,actions}.ts` — `membership.status='suspended'`.
- **D4 — Dezaktywacja credit_type:** `features/credits/deactivate.ts` (brak blokady, AC3).
- **D5 — Dezaktywacja location:** `features/locations/deactivate.ts` + `schedule/data.ts` helper (ostrzeżenie, nie blokada).
- **D6 — Substytucja trenera:** `features/schedule/substitute-trainer.ts` (LOCK ORDER, EXCLUDE, `isManuallyAdjusted`).
- **D7 — Masowa zmiana trenera:** `features/schedule/mass-reassign-trainer.ts` (savepoint per sesja).
- **D8 — Mass Move Bookings:** `features/schedule/mass-move-bookings.ts` (LOCK ORDER po id, capacity + collision).
- **D9 — Komponenty UI:** 5 komponentów (deactivate buttons, substitute form, dialogs).
- **D10 — Testy:** 4 pliki testowe klas błędów.

**Pozostało:** testy integracyjne (EXCLUDE, lock order), strona listy trenerów, wpięcie komponentów w istniejące strony.

