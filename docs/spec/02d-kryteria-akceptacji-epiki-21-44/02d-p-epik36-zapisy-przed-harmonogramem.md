### EPIK 36 — Zapisy przed ustaleniem harmonogramu (v17)

**US-36.1** Jako administrator, chcę utworzyć ofertę zbierającą zainteresowanie, zanim ustalę dzień/godzinę/trenera.
- AC1: Given tworzę `group_type` i ustawiam `status=collecting_interest`, When zapisuję, Then oferta istnieje bez żadnego `group_type_recurrence` ani `session` i nie jest to błąd.
- AC2: Given oferta ma `status=collecting_interest`, When klient otwiera jej stronę publiczną, Then widzi formularz zainteresowania (dla kogo/dane uczestnika/kontakt), a **nie** kalendarz sesji.

**US-36.2** Jako rodzic, chcę zgłosić zainteresowanie ofertą bez harmonogramu, bez żadnej opłaty.
- AC1: Given oferta `collecting_interest`, When wypełniam formularz zainteresowania, Then powstaje `interest_signup` (`client`+`athlete`) **bez** `booking`, bez `credit` i bez jakiejkolwiek płatności.
- AC2: Given zgłaszam to samo dziecko do tej samej oferty po raz drugi, When wysyłam zgłoszenie, Then nie powstaje duplikat (Constraint 13) — operacja jest no-opem.
- AC3: Given jestem nowym/niezweryfikowanym klientem, When zgłaszam zainteresowanie, Then przechodzę standardową weryfikację `client` (OTP) tak jak przy zapisie (§2.8) — zgłoszenie zainteresowania nie omija tożsamości klienta.

**US-36.3** Jako administrator, chcę po ustaleniu harmonogramu przenieść zainteresowanych do realnych rezerwacji.
- AC1: Given oferta ma zgłoszenia i utworzyłem realny wzorzec/sesje, When przenoszę zainteresowanego do wskazanej sesji, Then powstaje `booking` przez **pełną ochronę §5** (pojemność §5.2, kolizja zawodnika §5.3), a `interest_signup.converted_booking_id`/`converted_at` są ustawiane.
- AC2: Given sesja docelowa jest pełna lub zawodnik ma kolizję, When próbuję przenieść zainteresowanego, Then operacja jest odrzucana tym samym mechanizmem co każdy inny zapis — brak wyjątku dla konwersji.
- AC3: Given nie mam uprawnienia `interest.manage`, When wysyłam żądanie konwersji bezpośrednio przez API, Then jest odrzucane niezależnie od UI (§4.2).
