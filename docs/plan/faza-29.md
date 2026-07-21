## Faza 29 — Hasło klienta jako alternatywna metoda logowania (spec v19)

Retrofit dotykający **F3 (zakończona)** i **F5 (zakończona)** — nie czyste rozszerzenie nierozpoczętej fazy. Rozdzielona na dwie części, bo pole hasła + logika domenowa + ekran propozycji **nie zależą** od routingu strony logowania panelu (Rozstrzygnięcie #15–17). Nie łączyć obu części w jedną sesję pracy bez zgody użytkownika (Zasada pracy #3, `CLAUDE.md`).

---

### Faza 29a — Hasło klienta: schemat + logika domenowa + ekran propozycji

**Status:** nierozpoczęta
**Cel:** klient może opcjonalnie ustawić hasło z ekranu potwierdzenia rezerwacji; backend kompletny (hash, weryfikacja, reset z atomową rewokacją sesji), bez UI strony logowania panelu.
**Pokrywa:** EPIK 44 (US-44.1 w całości, US-44.4 — logika rate-limit); §2.43; Constraint 19; Rozstrzygnięcia spec #37–#39.
**Zależności:** **F3 ✅** (encja `client`, `client_session`, `features/client-auth/`), **F5 ✅** (ekran potwierdzenia rezerwacji, `enrollment-flow.tsx`).
**Migracja:** additive — trzy kolumny na `client` (`password_hash`, `password_set_at`, `password_updated_at`), numer kontynuujący `0022_rls_credits`; **sprawdzić monotoniczność `when` w `meta/_journal.json` przed `db:migrate`** (pułapka D46/D51/D67 — wraca przy każdej fazie dokładającej migrację); kolumny nullable, nie dotykają żadnego constraintu §5 ani istniejących unique (`client_org_email_uq`).
**Zakres:** rozszerzenie `src/lib/db/schema/clients.ts` o trzy kolumny; nowa logika w `src/features/client-auth/` — hash/weryfikacja hasła (algorytm do zweryfikowania na starcie fazy: sprawdzić, czy boilerplate/Better Auth ma gotowy wzorzec email+password do zreużycia zamiast pisać argon2 od zera, spec §8 #26), funkcja resetu (`resetClientPassword` — update hasha + `revokeAllSessionsForClient` w **jednej transakcji**, Constraint 19), rozszerzenie `rate-limit.ts` o nowy bucket/próg pod próby logowania hasłem (reużycie adaptera, Rozstrzygnięcie #16); rozszerzenie `session.ts` o `revokeAllSessionsForClient(clientId)` (usunięcie wszystkich `client_session` tego klienta, nie tylko bieżącej); sekcja „ustaw hasło" w `enrollment-flow.tsx` w gałęzi `state.bookingId` (dziś linia ~100-106) — pomijalna jednym kliknięciem, bez warunku na `payment_status`, renderowana też dla ścieżki rozpoznanego klienta (`recognized !== null`) i jednorazowo po ostatniej próbie sekwencyjnego zapisu wielodzietnego (jeśli Faza 22 już wdrożona — w przeciwnym razie ten przypadek odkłada się naturalnie, bo multi-child jeszcze nie istnieje); powiadomienie `client_password_changed` (§2.16, `is_overridable=false`) — e-mail-first jeśli Faza 14/Notification Center jeszcze nie zamknięta (wzorzec Rozstrzygnięcia #24 v16 dla `grade_recorded`), retrofit do katalogu in-app inaczej.
**Nie dotyka:** routingu paneli, middleware'u subdomenowego (F4.5), żadnej tabeli poza `client`.
**DoD:** e2e: ustawienie hasła z ekranu potwierdzenia dla rezerwacji `payment_pending` i dla `confirmed` (oba przypadki, dowód na Constraint niezależności); pominięcie ekranu bez konsekwencji (`password_hash` pozostaje `NULL`, OTP nadal jedyną ścieżką); ustawienie hasła dla klienta rozpoznanego (OTP pominięty, US-4.2); reset hasła (wywołany bezpośrednio, bez UI logowania — to przyjdzie w F29b) unieważnia **wszystkie** `client_session` tego klienta w tej samej transakcji co update hasha; rate limit na próby weryfikacji hasła (osobny bucket od OTP); migracje od zera; suita zielona.

**⚠️ Blast radius (hasło klienta, część a):**
- **Zakończone fazy do ponownego dotknięcia:** **F3** (`src/lib/db/schema/clients.ts` — nowe kolumny; `src/features/client-auth/{session,rate-limit}.ts` i nowe pliki logiki hasła w tym samym katalogu); **F5** (`src/features/bookings/components/enrollment-flow.tsx` — nowa sekcja w gałęzi `state.bookingId`). Żadna z dwóch faz nie wymaga zmiany istniejących publicznych sygnatur (`resolveClientSession`, `requireClient`, `createBookingAction` — wszystkie bez zmian).
- **Nierozpoczęte fazy rosnące bez ryzyka retrofitu:** **F14** (Notification Center — seed `client_password_changed` do katalogu, jeśli F14 zamyka się po F29a); **F22** (zapis wielodzietny, jeśli jeszcze nierozpoczęty w momencie F29a — ekran propozycji renderuje się per-booking do czasu, aż F22 wprowadzi orkiestrator batcha, wtedy F22 przenosi wywołanie na koniec sekwencji zamiast F29a wymuszać przedwczesną zależność).

---

### Faza 29b — Strona logowania panelu klienta (hasło jako ścieżka główna, OTP jako reset)

**Status:** nierozpoczęta
**Cel:** klient loguje się hasłem, jeśli je ustawił; OTP na tej stronie jest wyłącznie wymuszonym resetem, nigdy równoległym fallbackiem.
**Pokrywa:** EPIK 44 (US-44.2, US-44.3); §2.43; Rozstrzygnięcie spec #37.
**Zależności:** **F29a** (schemat + logika hasła); **F4.5 ✅** (middleware subdomenowy — formalna zależność routingu; już zamknięty, więc nie blokuje w praktyce, patrz Rozstrzygnięcie #17 wyżej).
**Migracja:** żadna — F29a już wprowadziła kolumny.
**Zakres:** nowa trasa/strona logowania panelu klienckiego pod `{organization.subdomain}.langlion.pl` (dziś **nie istnieje** jako UI — F3 świadomie zostawiła warstwę prezentacji na później, patrz `docs/plan/faza-3.md`); warunkowe renderowanie: brak `password_hash` → wyłącznie „zaloguj przez kod" (istniejący komponent/flow OTP z F3, reużyty bez zmian); obecny `password_hash` → pole hasła jako ścieżka główna + link „nie pamiętam hasła"; ścieżka „nie pamiętam hasła" → istniejący OTP (F3) → wymuszony formularz nowego hasła → wywołanie `resetClientPassword` z F29a; logowanie hasłem tworzy `client_session` tym samym mechanizmem co po OTP (`createClientSession`, D37) — brak drugiego mechanizmu sesji.
**Nie dotyka:** `/zapisy/*` (formularz zapisowy, bez zmian — Model punkt 1, §2.43).
**DoD:** e2e: klient bez hasła widzi wyłącznie logowanie kodem na stronie panelu; klient z hasłem loguje się hasłem i dostaje `client_session`; „nie pamiętam hasła" → OTP → wymuszone nowe hasło → stare hasło odrzucane, wszystkie poprzednie sesje zerwane, właściciel konta dostaje niewyłączalne powiadomienie `client_password_changed`; próba pominięcia kroku ustawienia nowego hasła po weryfikacji OTP na tej ścieżce jest niemożliwa (brak trasy do panelu z pominięciem tego kroku); suita zielona.

**⚠️ Blast radius (hasło klienta, część b):**
- **Zakończone fazy do ponownego dotknięcia:** **ŻADNA** — nowa trasa, reużywająca bez zmian sygnatur `resolveClientSession`/`createClientSession` (F3) i logikę hasła z F29a. F4.5 dotknięta wyłącznie formalną zależnością (trasa żyje pod istniejącym middlewarem), bez zmiany jego kodu.
- **Nierozpoczęte fazy rosnące bez ryzyka retrofitu:** brak — faza samodzielna po F29a.

---

