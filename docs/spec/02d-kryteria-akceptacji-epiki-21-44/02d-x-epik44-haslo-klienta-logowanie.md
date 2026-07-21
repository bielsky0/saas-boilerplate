### EPIK 44 — Hasło klienta jako alternatywna metoda logowania (v19)

**US-44.1** Jako klient (rodzic), chcę móc opcjonalnie ustawić hasło po zakończeniu rezerwacji, aby przy kolejnej wizycie zalogować się szybciej niż kodem z e-maila.
- AC1: Given zakończyłem właśnie rezerwację (dowolny `payment_status`), When ląduję na ekranie potwierdzenia, Then widzę pomijalną jednym kliknięciem sekcję „ustaw hasło", niezależnie od tego, czy rezerwacja jest `confirmed`, `payment_pending` czy `booked_offline` (§2.43).
- AC2: Given jestem klientem rozpoznanym po cookie sesji (US-4.2, krok OTP pominięty), When kończę rezerwację, Then ekran propozycji hasła pojawia się tak samo, jak dla klienta, który przeszedł OTP.
- AC3: Given zapisuję N dzieci w jednym przejściu (EPIK 40), When ostatnia z sekwencyjnych prób zapisu się kończy (niezależnie od tego, ile się powiodło), Then ekran propozycji hasła pojawia się dokładnie raz, nie per dziecko.
- AC4: Given widzę ekran propozycji hasła, When pomijam go bez ustawienia hasła, Then nic się nie dzieje — `client.password_hash` pozostaje `NULL`, logowanie kodem OTP działa bez zmian.
- AC5: Given ustawiam hasło z ekranu propozycji, When zapis się powiedzie, Then `client.password_hash`/`password_set_at` są ustawione i klient może odtąd logować się hasłem w panelu.

**US-44.2** Jako klient z ustawionym hasłem, chcę zalogować się do panelu hasłem zamiast kodem, aby nie czekać na e-mail przy każdej wizycie.
- AC1: Given `client.password_hash IS NULL`, When otwieram stronę logowania panelu, Then widzę wyłącznie opcję „zaloguj przez kod" — bez regresji względem zachowania sprzed v19.
- AC2: Given `client.password_hash IS NOT NULL`, When otwieram stronę logowania panelu, Then pole hasła jest ścieżką główną logowania.
- AC3: Given podaję poprawne hasło, When logowanie się powiedzie, Then powstaje `client_session` tym samym mechanizmem co po weryfikacji OTP (D37) — brak drugiego, równoległego mechanizmu sesji.

**US-44.3** Jako klient, który zapomniał hasła, chcę je zresetować przez kod z e-maila, aby odzyskać dostęp bez kontaktu z obsługą.
- AC1: Given klikam „nie pamiętam hasła" na stronie logowania panelu, When podaję e-mail, Then otrzymuję domenowy OTP tym samym mechanizmem co dziś (Faza 3), nie nowym kanałem.
- AC2: Given weryfikuję poprawny kod, When weryfikacja się powiedzie, Then jestem wymuszony do ustawienia NOWEGO hasła — logowanie do panelu z pominięciem tego kroku jest niemożliwe (OTP tutaj nigdy nie jest równoległym fallbackiem logowania, §2.43).
- AC3: Given ustawiam nowe hasło po resecie, When zapis się powiedzie, Then stare hasło przestaje działać ORAZ wszystkie `client_session` tego klienta są unieważnione w tej samej transakcji (Constraint 19).
- AC4: Given reset hasła się powiódł, When operacja się kończy, Then generowane jest powiadomienie `client_password_changed` (§2.16) z `is_overridable=false` — właściciel konta nie może go wyłączyć.

**US-44.4** Jako właściciel platformy, chcę ograniczyć próby zgadywania hasła klienta, aby uniemożliwić brute-force.
- AC1: Given wielokrotne nieudane próby logowania hasłem dla tego samego klienta/adresu w krótkim czasie, When przekroczony zostaje próg, Then kolejne próby są odrzucane (429) tym samym adapterem rate-limit co OTP (`features/client-auth/rate-limit.ts`), z osobnym bucketem/progiem dobranym pod hasło.

---
