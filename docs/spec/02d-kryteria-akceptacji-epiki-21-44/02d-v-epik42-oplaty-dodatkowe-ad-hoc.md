### EPIK 42 — Opłaty dodatkowe ad-hoc (v18)

**US-42.1** Jako recepcja, chcę nałożyć jednorazową opłatę dodatkową na klienta.
- AC1: Given mam uprawnienie `extra_fees.manage`, When tworzę `extra_fee` (kwota, opis, opcjonalne powiązanie z uczestnikiem/rezerwacją/ofertą), Then powstaje wpis ze `status=pending`, `created_by_user_id` i zamrożoną walutą, **bez** generowania jakiegokolwiek `credit` (poza systemem kredytowym, Rozstrzygnięcie #35).
- AC2: Given nie mam `extra_fees.manage`, When wysyłam żądanie bezpośrednio przez API, Then jest odrzucane niezależnie od UI (§4.2).
- AC3: Given klient sprawdza portfel kredytów (§7.12), When istnieje jego `extra_fee`, Then nie pojawia się ono w portfelu — to nie kredyt.

**US-42.2** Jako recepcja, chcę nałożyć tę samą opłatę na wszystkich uczestników wycieczki naraz.
- AC1: Given wskazuję sesję/grupę i kwotę, When wykonuję nałożenie zbiorcze, Then dla każdego uczestnika powstaje osobny `extra_fee` w osobnej transakcji, a wynik to raport zbiorczy (Constraint 17).
- AC2: Given zapis dla jednego uczestnika zawiedzie technicznie, When operacja trwa, Then niepowodzenie tego wpisu **nie wycofuje** pozostałych — brak capacity/kolizji do sprawdzania, więc jedyną przyczyną niepowodzenia jest błąd techniczny.

**US-42.3** Jako klient, chcę opłacić opłatę dodatkową online lub na miejscu.
- AC1: Given `payment_method=online` i `stripe_connect_status=active`, When płacę, Then Checkout/PaymentIntent powstaje na **Connected Account** organizacji (ad-hoc `price_data`, Zasada #7), a po potwierdzeniu `status → paid`.
- AC2: Given `stripe_connect_status != active`, When próbuję zapłacić online, Then Checkout nie jest generowany (Constraint 7), ale opłata `cash` pozostaje dostępna.
- AC3: Given `payment_method=cash`, When recepcja potwierdza otrzymanie gotówki, Then `status → paid` i operacja jest logowana w audit trail.

**US-42.4** Jako administrator, chcę skorygować błędnie nałożoną opłatę.
- AC1: Given `extra_fee` istnieje, When anuluję/usuwam wpis, Then przechodzi w `status=cancelled` (albo soft delete) — **nie** następuje żaden zwrot przez Stripe Refund ani zmiana statusu na `refunded` (Rozstrzygnięcie #33).
- AC2: Given akademia chce faktycznie zwrócić pieniądze, When szukam ścieżki zwrotu w systemie, Then taka ścieżka nie istnieje — zwrot odbywa się poza systemem (jak ręczne fakturowanie §2.17).

**US-42.5** Jako klient, chcę móc poprosić o fakturę do opłaty dodatkowej.
- AC1: Given mam opłacone `extra_fee`, When zgłaszam chęć faktury, Then `invoice_requested_at` jest ustawiane, a zgłoszenie trafia na tę samą listę fakturowania co `credit_purchase` (§2.17, Rozstrzygnięcie #36).
