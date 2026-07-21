### EPIK 31 — Potwierdzanie obecności (v15)

**US-31.1** Jako trener, chcę oznaczyć obecność uczestników z listy sesji, aby akademia miała ślad, kto faktycznie przyszedł.
- AC1: Given otwieram listę uczestników prowadzonej przeze mnie sesji, When oznaczam uczestnika jako `present` lub `absent`, Then `booking.attendance_status` jest zapisywany wraz z `attendance_marked_at` i `attendance_marked_by_user_id`.
- AC2: Given nie mam uprawnienia `bookings.mark_attendance`, When wysyłam żądanie bezpośrednio przez API, Then jest ono odrzucane niezależnie od tego, co pokazuje UI.
- AC3: Given jestem trenerem i próbuję oznaczyć obecność na sesji, której NIE prowadzę, When żądanie dociera do backendu, Then jest odrzucane — ograniczenie „wyłącznie własne sesje" jest egzekwowane na backendzie, nie tylko filtrem listy w UI.
- AC4: Given oznaczenie zostało zapisane, When sprawdzam audit trail (boilerplate §6.4), Then widoczne jest kto, kiedy, która rezerwacja i jaka wartość.

**US-31.2** Jako system, chcę, aby obecność była całkowicie niezależna od statusu płatności.
- AC1: Given oznaczam uczestnika jako `present` lub `absent`, When zapis następuje, Then `booking.payment_status` pozostaje niezmieniony.
- AC2: Given rezerwacja ma `payment_status = no_show` (§US-16.2), When sprawdzam jej `attendance_status`, Then pozostaje on `unmarked` — oznaczenie `no_show` nie ustawia statusu obecności ani odwrotnie.
- AC3: Given rezerwacja ma `payment_status = booked_offline` (nieopłacona), When trener oznacza uczestnika jako `present`, Then operacja się powodzi — brak płatności nie blokuje potwierdzenia obecności.
- AC4: Given oznaczam obecność, When operacja się kończy, Then NIE następuje żadna automatyczna konsekwencja: nie powstaje ani nie jest zwracany kredyt, nie zmienia się status rezerwacji, nie jest wysyłane powiadomienie.

**US-31.3** Jako recepcja, chcę poprawić błędnie oznaczoną obecność.
- AC1: Given uczestnik został wcześniej oznaczony jako `absent`, When zmieniam oznaczenie na `present`, Then wartość jest nadpisywana, a `attendance_marked_at`/`attendance_marked_by_user_id` aktualizowane na moment i autora korekty.
- AC2: Given korekta nastąpiła, When sprawdzam audit trail, Then poprzednia wartość jest z niego odtwarzalna — historia zmian nie jest tracona przez nadpisanie.

**US-31.4** Jako administrator, chcę odróżnić „nikt nie sprawdził listy" od „uczestnika nie było".
- AC1: Given sesja się odbyła, ale nikt nie oznaczył obecności, When przeglądam listę uczestników, Then wszystkie rezerwacje mają `unmarked`, wizualnie odróżnialne od `absent`.
- AC2: Given sesja ma wyłącznie oznaczenia `unmarked`, When jest przetwarzana przez raport wynagrodzeń (§2.30), Then nie kwalifikuje się do sumy — zgodnie z US-32.3/AC2.
