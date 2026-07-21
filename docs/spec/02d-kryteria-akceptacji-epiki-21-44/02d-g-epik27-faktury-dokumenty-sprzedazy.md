### EPIK 27 — Faktury i dokumenty sprzedaży, proces ręczny

**US-27.1** Jako klient, chcę móc poprosić o fakturę do mojego zakupu.
- AC1: Given mam zakończony `credit_purchase`, When zgłaszam chęć otrzymania faktury, Then `invoice_requested_at` jest ustawiane, a zgłoszenie trafia na listę widoczną dla recepcji/admina.

**US-27.2** Jako recepcja, chcę widzieć listę zakupów oczekujących na wystawienie faktury i odznaczyć je po wystawieniu ręcznym.
- AC1: Given lista zakupów z `invoice_requested_at IS NOT NULL AND invoice_issued_at IS NULL`, When przeglądam ją, Then widzę dane klienta i kwotę potrzebną do ręcznego wystawienia faktury.
- AC2: Given wystawiłem fakturę ręcznie poza systemem, When oznaczam zakup jako rozliczony i wpisuję numer faktury, Then `invoice_issued_at`, `invoice_number`, `invoice_issued_by_user_id` są zapisywane.
- AC3: Given próbuję oznaczyć fakturę jako wystawioną bez wcześniejszego `invoice_requested_at`, When zapisuję, Then system i tak na to pozwala.

**US-27.3** Jako administrator, chcę mieć pewność, że brak automatycznego fakturowania nie blokuje standardowej sprzedaży online.
- AC1: Given klient płaci online za pojedyncze zajęcia lub pakiet, When płatność się powodzi, Then rezerwacja/kredyty są tworzone normalnie, niezależnie od tego, czy klient kiedykolwiek poprosi o fakturę.
