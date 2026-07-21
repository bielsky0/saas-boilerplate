### EPIK 22 — Lokalizacje

**US-22.1** Jako administrator, chcę zdefiniować listę lokalizacji mojej akademii, aby móc przypisywać do nich zajęcia.
- AC1: Given tworzę `location` z nazwą „Hala Centrum", When zapisuję, Then lokalizacja jest dostępna do wyboru przy definiowaniu typów grup i wzorców w mojej organizacji.
- AC2: Given próbuję dezaktywować lokalizację przypisaną do przyszłych, nieodbytych sesji, When wykonuję operację, Then system pokazuje ostrzeżenie z listą/liczbą dotkniętych sesji, ale nie blokuje twardo.

**US-22.2** Jako administrator, chcę ustawić domyślną lokalizację dla typu grupy, aby nie wybierać jej ręcznie przy każdym wzorcu.
- AC1: Given ustawiam `group_type.default_location_id`, When tworzę nowy `group_type_recurrence` bez wskazania własnej lokalizacji, Then wygenerowane sesje dziedziczą lokalizację z typu grupy.
- AC2: Given wzorzec ma ustawioną własną `location_id`, When generowane są sesje, Then dziedziczą lokalizację wzorca, nie typu grupy.

**US-22.3** Jako administrator, chcę zmienić lokalizację pojedynczej sesji, bez wpływu na resztę sezonu.
- AC1: Given ręcznie zmieniam `location_id` konkretnej sesji, When zapisuję, Then `session.is_manually_adjusted` jest ustawiane na `true`.
- AC2: Given sesja ma `is_manually_adjusted=true` z tego powodu, When admin później zmienia lokalizację na poziomie wzorca dla całego sezonu, Then ta sesja jest pomijana przy masowej aktualizacji.

**US-22.4** Jako administrator, chcę zmienić lokalizację dla całego wzorca w trakcie sezonu i mieć spójny grafik.
- AC1: Given zmieniam `group_type_recurrence.location_id`, When zapisuję zmianę, Then wszystkie przyszłe, nieodbyte sesje tego wzorca (poza tymi z `is_manually_adjusted=true`) są aktualizowane w miejscu na nową lokalizację.
- AC2: Given zmiana lokalizacji dotyka klientów z rezerwacjami, When zmiana jest zapisana, Then wysyłane jest powiadomienie do każdego dotkniętego klienta.

**US-22.5** Jako klient/trener, chcę widzieć, gdzie odbywają się zajęcia.
- AC1: Given przeglądam potwierdzenie rezerwacji, powiadomienie przypominające lub panel trenera, When wyświetlana jest sesja, Then widoczna jest jej `location_id` (nazwa i adres).
- AC2: Given akademia ma tylko jedną aktywną lokalizację, When klient przegląda ofertę, Then lokalizacja jest nadal wyświetlana, ale nie jest wymagana jako krok wyboru przy rezerwacji.
