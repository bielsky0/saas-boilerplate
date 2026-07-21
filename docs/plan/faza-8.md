### Faza 8 — Soft delete domenowy + reasygnacje

**Status:** nierozpoczęta
**Cel:** bezpieczne wycofywanie zasobów z obiegu (Zasada #4: blokada z listą zależności, nie kreator).
**Pokrywa:** EPIK 20, 21; §2.11.
**Zależności:** F7 (odwołanie sesji jako narzędzie rozwiązywania zależności).
**Zakres:** dezaktywacje z bramkami: `group_type` (blokada przy aktywnym `is_recurring` lub przyszłych sesjach), trener/offboarding (blokada przy przyszłych sesjach, lista w toaście), `credit_type` (istniejące kredyty żyją do wygaśnięcia), `location` (ostrzeżenie, NIE twarda blokada — decyzja #6 spec §7); substytucja trenera w pojedynczej sesji (constraint §5.1 = hard block); masowa zmiana trenera (osobna tx per sesja, pominięcia + raport zbiorczy); Mass Move Bookings (per uczestnik: capacity + kolizja; UPDATE bookingu, nie recreate; lista „wymaga ręcznej interwencji"); uprawnienia `trainers.offboard`, `sessions.mass_reassign_trainer`, `sessions.mass_move_bookings`, `group_types.deactivate`.
**DoD:** e2e na AC US-21.x i US-20.1; raporty częściowego sukcesu; suita zielona.

---

