### EPIK 35 — E-dziennik: oceny i notatki o postępach (v16)

**US-35.1** Jako administrator/trener, chcę zdefiniować konfigurowalne pola ocen dla typu grupy lub pojedynczej sesji.
- AC1: Given mam uprawnienie `grade_fields.manage`, When tworzę `grade_field` ze wskazanym `group_type_id`, Then pole jest szablonem dziedziczonym przez wszystkie sesje tego typu.
- AC2: Given tworzę `grade_field` ze wskazanym `session_id`, When zapisuję, Then pole obowiązuje ad-hoc wyłącznie na tej sesji (np. „Kartkówka").
- AC3: Given próbuję zapisać `grade_field` z ustawionymi jednocześnie `group_type_id` i `session_id` (albo z żadnym z nich), When zapisuję, Then baza odrzuca zapis (CHECK constraint XOR, Constraint 12).
- AC4: Given sesja ma zarówno pola dziedziczone z typu, jak i pole ad-hoc, When wyświetlana jest lista pól tej sesji, Then jest to suma obu zbiorów (Constraint 12).

**US-35.2** Jako trener, chcę wpisać ocenę uczestnikowi z komentarzem z listy uczestników sesji.
- AC1: Given otwieram listę uczestników prowadzonej przeze mnie sesji, When wpisuję wartość oceny i komentarz uczestnikowi, Then powstaje `grade` z `graded_by_user_id`/`graded_at`.
- AC2: Given nie mam uprawnienia `grades.enter`, When wysyłam żądanie bezpośrednio przez API, Then jest ono odrzucane niezależnie od tego, co pokazuje UI.
- AC3: Given jestem trenerem i próbuję wpisać ocenę na sesji, której NIE prowadzę, When żądanie dociera do backendu, Then jest odrzucane — ograniczenie „wyłącznie własne sesje" egzekwowane na backendzie, nie filtrem listy w UI.
- AC4: Given nadpisuję wcześniej wpisaną ocenę, When zapis następuje, Then poprzednia wartość jest odtwarzalna z audit trail (jak przy `attendance_status`).

**US-35.3** Jako trener, chcę dodać notatkę o postępach uczestnika niepowiązaną z konkretną oceną.
- AC1: Given mam uprawnienie `grades.enter`, When dodaję `progress_note` (tytuł + treść) do uczestnika, Then jest zapisana z autorem i czasem, opcjonalnie w kontekście sesji.
- AC2: Given notatka istnieje, When sprawdzam, do czego jest przypięta, Then wskazuje `athlete`, nie konkretny `grade` — jest niezależna od oceny.

**US-35.4** Jako system, chcę, aby oceny i notatki były całkowicie niezależne od płatności i obecności.
- AC1: Given wpisuję lub edytuję ocenę/notatkę, When zapis następuje, Then `booking.payment_status` i `booking.attendance_status` pozostają niezmienione.
- AC2: Given oznaczam obecność albo zmieniam status płatności, When operacja się kończy, Then nie powstaje ani nie zmienia się żadna ocena/notatka.
- AC3: Given wpisuję ocenę/notatkę, When operacja się kończy, Then NIE następuje żadna automatyczna konsekwencja poza powiadomieniem klienta (US-35.5): nie zwraca się kredyt, nie zmienia status rezerwacji.

**US-35.5** Jako klient, chcę być informowany o nowej ocenie lub notatce o postępach mojego dziecka.
- AC1: Given trener wpisuje ocenę lub notatkę, When zdarzenie następuje, Then generowane jest powiadomienie `grade_recorded`/`progress_note_added` (§2.16), `is_overridable=tak`.
- AC2: Given Notification Center (EPIK 26) nie jest jeszcze wdrożony, When zdarzenie następuje, Then powiadomienie idzie e-mailem od razu; pełna integracja in-app dochodzi razem z EPIK 26.

**US-35.6** Jako klient, chcę widzieć oceny i notatki mojego dziecka w moim panelu.
- AC1: Given moje dziecko ma wpisane oceny/notatki, When otwieram panel klienta, Then widzę je z nazwą pola, wartością, komentarzem i datą.
- AC2 (§8): Given rozstrzygnięto warunek widoczności sekcji, When otwieram panel bez żadnego wpisu, Then sekcja jest widoczna/ukryta zgodnie z decyzją z §8 (zawsze gdy ≥1 wpis vs analogicznie do widoczności portfela z §7.6).

**US-35.7** Jako administrator systemu, chcę mieć pewność, że uprawnienia e-dziennika są egzekwowane na backendzie.
- AC1: Given użytkownik bez `grades.enter` lub `grade_fields.manage` wysyła bezpośrednie żądanie API, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI (wzorzec §4.2, jak US-31.1/AC2).

Powiązane: 02d-k-epik31-potwierdzanie-obecnosci.md
