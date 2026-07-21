### EPIK 34 — Dyspozycyjność trenerów (v16)

**US-34.1** Jako administrator, chcę zdefiniować okna dostępności trenera, aby silniki mogły podpowiadać realne sloty.
- AC1: Given mam uprawnienie `trainer_availability.manage`, When zapisuję okno `(trainer_id, day_of_week, start_time, end_time)`, Then jest ono interpretowane w `organization.timezone` (jak `group_type_recurrence`) i dostępne dla liczenia slotów.
- AC2: Given trener nie ma żadnego zdefiniowanego okna, When system liczy sloty, Then operacja nie jest blokowana — brak dostępności jest dozwolony (fail-safe), a nie błędem konfiguracji zatrzymującym sprzedaż.
- AC3 (§8): Given rozstrzygnięto, kto zarządza dostępnością, When trener próbuje edytować własną dostępność, Then dostęp zależy od decyzji z §8 (na dziś: wyłącznie Owner/Admin).

**US-34.2** Jako klient Slot-First, chcę widzieć realne wolne sloty zamiast zgadywać godziny.
- AC1: Given wybieram dzień i `group_type` z silnikiem `slot_first`, When system liczy sloty, Then wynik = (okna dostępności kwalifikujących się trenerów) MINUS (istniejące `class_session` tych trenerów tego dnia, cały grafik), pocięte co `group_type.default_duration_minutes` (Constraint 11).
- AC2: Given żaden kwalifikujący się trener nie ma zdefiniowanego okna tego dnia, When liczone są sloty, Then granicą jest domyślna godzina pracy, nie cała doba (fail-safe, nie fail-open).
- AC3: Given dwóch klientów klika ten sam podpowiedziany slot niemal jednocześnie, When oba zapisy trafiają do bazy, Then o poprawności rozstrzyga wyłącznie constraint §5.1 — jedna transakcja kończy się sukcesem, druga jest odrzucana.

**US-34.3** Jako administrator Availability-First, chcę widzieć ostrzeżenie o dostępności, ale móc utworzyć sesję poza oknem.
- AC1: Given tworzę ręcznie sesję (silnik `availability_first`) poza zadeklarowanym oknem trenera, When zapisuję, Then otrzymuję **miękkie ostrzeżenie**, ale zapis się powodzi.
- AC2: Given nowa sesja koliduje czasowo z inną sesją tego trenera, When zapisuję, Then operacja jest **twardo blokowana** przez constraint §5.1 — dostępność jest ostrzeżeniem, kolizja trenera jest blokadą.

**US-34.4** Jako system, chcę znać długość i pojemność sesji tworzonej w locie przez silniki bez wzorca.
- AC1: Given `group_type` z silnikiem `slot_first`/`availability_first` i ustawionymi `default_duration_minutes`/`default_capacity`, When sesja jest tworzona w locie, Then dziedziczy z tych pól długość i pojemność (kopiowaną do `session.capacity`).
- AC2: Given `group_type` z silnikiem `schedule_first`, When generowane są sesje z wzorca, Then długość i pojemność pochodzą nadal z `group_type_recurrence`, nie z pól `default_*`.

**US-34.5** Jako system, chcę mieć pewność, że dostępność nigdy nie jest źródłem prawdy o zajętości.
- AC1: Given slot jest pokazany jako wolny, ale w międzyczasie powstała kolidująca sesja trenera, When klient próbuje zapisać, Then zapis jest odrzucany constraintem §5.1, mimo że podpowiedź go dopuszczała.
- AC2: Given dostępność trenera sugeruje „zajęty" w danym oknie, When admin/klient inicjuje zapis, Then sam ten fakt nie blokuje operacji — blokuje wyłącznie realna kolizja (§5.1).
