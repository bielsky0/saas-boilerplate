### EPIK 43 — Tematy lekcji i śledzenie prac domowych (v18)

**US-43.1** Jako trener, chcę zapisać temat dzisiejszej lekcji i zadać pracę domową z listy uczestników sesji.
- AC1: Given otwieram listę uczestników prowadzonej przeze mnie sesji, When wpisuję temat (`lesson_topic`) i/lub zadaję pracę domową (`homework`), Then powstają wpisy z `created_by_user_id`, w sekcji „Szczegóły lekcji" tej samej listy, na której żyją oceny i obecność.
- AC2: Given nie mam uprawnienia `lesson_log.manage`, When wysyłam żądanie bezpośrednio przez API, Then jest odrzucane niezależnie od UI (§4.2).
- AC3 (wzorzec US-31.1/AC3, backend-enforced): Given jestem trenerem i próbuję zadać pracę domową / wpisać temat / odznaczyć wykonanie na sesji, której **NIE** prowadzę, When żądanie dociera do backendu, Then jest odrzucane — ograniczenie „wyłącznie własne sesje" egzekwowane na backendzie, nie filtrem listy w UI.

**US-43.2** Jako trener, chcę odznaczyć, którzy uczestnicy wykonali pracę domową.
- AC1: Given praca domowa istnieje, When oznaczam uczestnika jako `done` lub `not_done`, Then powstaje/aktualizuje się `homework_completion` z `marked_by_user_id`/`marked_at`, a `completed_by_actor_type` = `staff` (w tej wersji zapisuje wyłącznie personel — Rozstrzygnięcie #31; pole rezerwowe pod przyszłe oznaczanie przez rodzica).
- AC2: Given nadpisuję wcześniejszy status, When zapis następuje, Then poprzednia wartość jest odtwarzalna z audit trail (jak `attendance_status`).
- AC3: Given oznaczam wykonanie pracy domowej, When operacja się kończy, Then `booking.payment_status` i `booking.attendance_status` pozostają niezmienione (Constraint 18); a oznaczenie obecności/płatności nigdy nie tworzy ani nie rusza `homework_completion` — w obie strony.

**US-43.3** Jako administrator, chcę zadecydować, czy praca domowa musi być powiązana z sesją.
- AC1: Given zadaję pracę domową, When wskazuję (lub pomijam) `session_id`, Then zachowanie zależy od decyzji z §8 (#23) — kolumna `session_id` jest nullable, co zostawia obie ścieżki.

**US-43.4** Jako klient, chcę być informowany o nowym temacie/zadaniu i widzieć je w panelu.
- AC1: Given trener wpisuje temat lub zadaje pracę domową, When zdarzenie następuje, Then generowane jest powiadomienie `lesson_topic_added`/`homework_assigned` (§2.16, `is_overridable=tak`), e-mailem od razu (e-mail-first; in-app retrofit z EPIK 26).
- AC2: Given moje dziecko ma wpisany temat/zadanie, When otwieram panel klienta, Then widzę temat, opis zadania, termin i status wykonania dziecka (retrofit razem z panelem klienta).

---

Powiązane: 02d-k-epik31-potwierdzanie-obecnosci.md
