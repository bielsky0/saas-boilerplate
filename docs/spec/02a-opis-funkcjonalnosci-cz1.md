## 2. Opis funkcjonalności — moduły (część 1: §2.1–§2.19)

Pełna sekcja 2 specyfikacji podzielona na pliki. Pozostałe części: [część 2 — §2.20–§2.43](02b-opis-funkcjonalnosci-cz2.md), kryteria akceptacji: [EPIK 1–20](02c-kryteria-akceptacji-epiki-1-20.md), [EPIK 21–44](02d-kryteria-akceptacji-epiki-21-44.md).

### 2.1 Trzy silniki rezerwacji

| Silnik | Zastosowanie | Tworzenie session | Trener wymagany | Konflikt trenera |
|---|---|---|---|---|
| Schedule-First | grupy regularne, obozy | generowane z `group_type_recurrence` | tak | ostrzeżenie + Force Override (rola z uprawnieniem) |
| Availability-First | konsultacje, lekcje jednorazowe | ręcznie, `is_recurring=false` | tak | Hard Block — brak opcji wymuszenia |
| Slot-First | treningi personalne, lekcje próbne | w locie, przy rezerwacji klienta | nie (na etapie definicji) | rozstrzyga wyłącznie constraint bazy |

### 2.2 Cykliczność i generowanie (Schedule-First)

Zapisanie `group_type_recurrence` z `is_recurring=true` automatycznie zleca zadanie w tle generujące `occurrences_count` sesji — generowanie nie jest osobną akcją admina. Rozszerzenie `occurrences_count` dogenerowuje wyłącznie brakujące terminy (idempotencja). Zmniejszenie liczby powtórzeń nie usuwa automatycznie istniejących sesji.

Edycja wzorca w trakcie sezonu: zmiana dnia/godziny LUB lokalizacji na aktywnym `group_type_recurrence` aktualizuje w miejscu (UPDATE) wszystkie przyszłe, nieodbyte sesje — historia pozostaje nietknięta. Istniejące rezerwacje NIE są anulowane, zostają przy tych samych sesjach z nową godziną/lokalizacją; zdenormalizowane `session_start_time`/`end_time` w `booking` muszą zostać zaktualizowane w tej samej transakcji. Zmiana wymaga powiadomienia dotkniętych klientów.

Ochrona współbieżności przy edycji wzorca (v8): aktualizacja każdej sesji bierze `SELECT ... FOR UPDATE` na jej wierszu — serializuje edycję względem równoległego tworzenia bookingu na tej samej sesji (kto pierwszy złapie blokadę, ten wygrywa; drugi operuje na już zaktualizowanych danych). Jeśli przesunięcie konkretnej sesji powoduje kolizję zawodnika (constraint §5.3, bo zdenormalizowany czas w istniejącym booking koliduje z inną aktywną rezerwacją tego zawodnika), tylko ta jedna sesja jest pomijana (zostaje przy starym czasie) — reszta sezonu przesuwa się normalnie. System generuje listę pominiętych sesji z powodem i powiadamia admina do ręcznego rozwiązania (ten sam wzorzec częściowego sukcesu co przy §7.5a).

### 2.3 Ochrona przed race conditions (§5)

Trzy niezależne mechanizmy, ten sam wzorzec: ograniczenie na poziomie bazy, nie logiki aplikacji.

1. **Podwójna rezerwacja trenera** — exclusion constraint na zakres czasu per trener.
2. **Przekroczenie pojemności sesji** — blokada wiersza (`FOR UPDATE`) + zliczenie aktywnych rezerwacji w tej samej transakcji co konsumpcja kredytu i utworzenie bookingu. Dotyczy KAŻDEJ ścieżki tworzenia bookingu (nowy zapis, Dopisanie, auto-wypełnienie pakietu, odrabianie, zmiana grupy). Brak wyjątku dla jakiejkolwiek roli — nie istnieje uprawnienie „przekrocz pojemność". Legalne obejścia: (a) zwolnienie miejsca przez anulowanie innej rezerwacji (generuje kredyt kompensacyjny niezależnie od reguły 24h), (b) podniesienie `session.capacity` na konkretnej sesji. `payment_pending` liczy się jako aktywna rezerwacja (zgodnie z ogólną regułą „`payment_status NOT IN ('cancelled')`") — dotyczy to również bookingu tworzonego przy zatwierdzeniu wniosku o Zmianę Grupy (§2.7), patrz `expires_at` niżej.
3. **Kolizja tego samego zawodnika na nakładających się sesjach** — exclusion constraint na `(athlete_id, zakres_czasu)`, niezależnie od silnika/trenera/typu. Bez wyjątku dla żadnej roli.

### 2.4 System kredytowy (§7)

Kredyt = jedyna waluta. Konsumpcja zawsze FIFO (najwcześniej wygasający najpierw), atomowo w jednej transakcji z tworzeniem bookingu (`SELECT ... FOR UPDATE SKIP LOCKED`). Zapytanie FIFO zawsze filtruje `status = 'available'` — kredyty w stanie `pending_refund` są przez to automatycznie pomijane.

Ścieżki generujące kredyt:
- Odwołanie przez klienta (reguła 24h) → `source=cancellation` — wyłącznie gdy odwoływana rezerwacja miała `payment_status=confirmed` w momencie odwołania. Jeśli rezerwacja nigdy nie została opłacona (`booked_offline`), odwołanie zmienia status na `cancelled` bez generowania jakiegokolwiek kredytu.
- Odwołanie sesji przez admina → `source=admin_session_cancellation`.
- Ręczne nadanie przez admina (wymaga powodu) → `source=manual_admin_grant`.
- Zakup pakietu online/gotówka → `source=subscription_purchase`.
- Płatność online za pojedyncze zajęcia → `source=online_payment` (generowany i natychmiast konsumowany w tej samej transakcji).
- Płatność na miejscu → `source=on_site_payment` (generowany i konsumowany po ręcznym zatwierdzeniu).

Portfel rodzinny: `credit.athlete_id` NULL = dowolne dziecko tego samego rodzica. Przeniesienie kredytu między dziećmi wymaga wniosku rodzica + zatwierdzenia admina.

Widoczność portfela w UI (§7.12): widoczny WYŁĄCZNIE przy niezerowym saldzie `available`. Kredyty generowane i konsumowane atomowo (drop-in) nigdy się w nim nie pojawiają.

### 2.5 Zakup pakietu i auto-wypełnienie terminów (§7.5a, tylko Schedule-First)

Jednorazowa, nieponawiana próba zapisania klienta na najbliższe `credit_quantity` nadchodzących terminów wskazanego wzorca (`target_recurrence_id`), wykonana sekwencyjnie tym samym mechanizmem co Dopisanie (§7.5), przechodząca przez pełną ochronę §5. Nieudane próby (capacity/kolizja) NIE są ponawiane — kredyt zostaje `available` w portfelu do ręcznego wykorzystania. Nie dotyczy Availability-First/Slot-First (tam wyłącznie floating pool).

### 2.6 Zakup pakietu gotówką na miejscu (§7.7a)

Rozszerza model o `payment_method=cash` (zatwierdzenie admina zastępuje webhook). Po wygenerowaniu kredytów, system w określonej kolejności:
1. Najpierw automatycznie rozlicza (FIFO) wszystkie istniejące `booked_offline` rezerwacje tego klienta pasujące pod `credit_type_id` i filtr rodzinny — nie tylko tę bieżącą.
2. Dopiero pozostałą pulą próbuje auto-wypełnienia najbliższych terminów (§7.5a), jeśli podano `target_recurrence_id`.
3. Reszta trafia do portfela jako w pełni wolne kredyty.

### 2.7 Dwie ścieżki rezerwacji klienta (§6, §7)

**Proces A — Dopisanie (self-service):** klient dodaje kolejny termin w ramach typu, do którego należy. Automatyczne, bez ingerencji admina. Zawsze przechodzi przez pełną ochronę §5 — posiadanie kredytu nie omija sprawdzenia dostępności.

**Proces B — Zmiana Grupy (swap),** reprezentowana jako `group_change_request`: rezygnacja z obecnego terminu na rzecz innego. Trzyetapowy przepływ:
1. Klient składa wniosek (`submitted`).
2. Admin weryfikuje wykonalność (miejsce w grupie docelowej — ostateczna gwarancja to constraint §5.2, ocena admina to dodatkowa warstwa) i zatwierdza (`admin_approved`) lub odrzuca (`admin_rejected`). Przy zatwierdzeniu wyliczana i zamrażana jest `price_difference`; jeśli różna od zera, tworzona jest nowa `booking` w `payment_pending` (blokuje miejsce w docelowej sesji) i ustawiany `expires_at`.
3. Admin nigdy nie ściąga automatycznie środków z konta klienta. Dopłatę (`price_difference > 0`) klient reguluje sam, świadomie, przez link Stripe Checkout — dokładnie ten sam mechanizm co zwykła płatność online (§6.3), wyzwolony zatwierdzeniem admina zamiast samodzielnym zapisem. Zwrot (`price_difference < 0`) inicjowany jest automatycznie tym samym mechanizmem co §2.9. Finalizacja (`completed`) następuje dopiero po potwierdzeniu płatności/zwrotu przez webhook — nigdy po samym kliknięciu.

Wniosek zatwierdzony, ale niedopłacony w terminie `expires_at`, wygasa automatycznie (cron), zwalniając zablokowane miejsce. Wniosek zatwierdzony może zostać anulowany przez admina lub klienta przed finalizacją (`cancelled_by_admin`/`cancelled_by_client`) — powiązany `payment_pending` booking jest wtedy również anulowany, druga strona dostaje powiadomienie.

Jeśli sesja docelowa zostaje odwołana przez admina (§14.1) w trakcie oczekiwania na płatność, powiązany wniosek automatycznie przechodzi w `cancelled_by_admin`, powiązany PaymentIntent jest anulowany, a oryginalna rezerwacja klienta pozostaje nietknięta (swap nigdy się nie sfinalizował).

Wzajemne wykluczenie z odwołaniem: rezerwacja (`booking`) może mieć w danym momencie co najwyżej jedną aktywną operację — otwarty `group_change_request` (`submitted`/`admin_approved`/`awaiting_payment`) LUB odwołanie (§EPIK 12), nigdy oba naraz, w obie strony.

Idempotencja webhooka PaymentIntent: finalizacja (`completed`) sprawdza aktualny status wniosku przed zastosowaniem efektów — jeśli webhook dotrze dwukrotnie (retry Stripe), druga dostawa trafia na wniosek już w stanie `completed` i jest ignorowana (no-op), analogicznie do idempotencji subskrypcji (§12.3).

### 2.8 Rozpoznanie istniejącego klienta (§6.1a)

`is_new_client_only` NIE jest twardą blokadą. Rozpoznany, zweryfikowany klient (po e-mailu, dopasowanie WYŁĄCZNIE w obrębie tej samej organizacji — rekord `client` z `is_verified=true` dla `(organization_id, email)`, rewizja 14.1) pomija formularz i OTP, przechodzi od razu do wyboru terminu. Nowy klient / `is_verified=false` — pełna ścieżka z OTP, niezależnie od flagi. Konto tego samego rodzica w INNEJ akademii nie jest rozpoznawane i nie skraca ścieżki — pełna izolacja ekosystemów per organizacja.

### 2.9 Zwroty fiducjarne (§13)

Admin wybiera per przypadek: zwrot częściowy (wartość niewykorzystanych kredytów, skonsumowana część nietknięta) lub zwrot pełny z cofnięciem (dodatkowo cofa przyszłe rezerwacje z już skonsumowanych kredytów tego zakupu). Formuła: `refund_amount = (niewykorzystane / zakupione) × price_paid`. Kwoty w tej formule wyrażane są w najmniejszej jednostce waluty (§2.14).

Blokada kredytów na czas oczekiwania na zwrot: w momencie kliknięcia „zatwierdź zwrot" (`credit_purchase.refund_initiated_at` ustawiane), wszystkie niewykorzystane (`available`) kredyty z tego `credit_purchase_id` przechodzą atomowo w `status=pending_refund` w tej samej transakcji, w której wyliczana jest `refund_amount`.

Zwrot potwierdzony (webhook `charge.refunded` dla online, albo kliknięcie admina dla cash) → `pending_refund → refunded`. Zwrot nieudany/anulowany (błąd Stripe Refund API, admin anuluje operację) → `pending_refund → available`.

Źródło prawdy o wykonaniu zwrotu zależy od `credit_purchase.payment_method`:
- **online:** webhook Stripe `charge.refunded` — dopiero po nim stosowany jest wybrany wariant.
- **cash:** kliknięcie admina „Potwierdzam zwrot gotówki" jest źródłem prawdy — od razu ustawia `refunded_at`/`refund_amount`/`refund_confirmed_by_user_id`, bez oczekiwania na jakikolwiek webhook.

### 2.10 RBAC — uprawnienia domenowe

| Uprawnienie | Domyślne role | Uwaga |
|---|---|---|
| `group_types.manage` | Owner, Admin | |
| `sessions.generate_season` | Owner, Admin | |
| `sessions.force_override` | Owner, Admin | wyłącznie konflikt trenera, nigdy pojemność |
| `sessions.manage` | Owner, Admin | w tym podniesienie capacity, zmiana location_id per-sesja |
| `credits.manual_grant` | Owner, Admin | wymaga powodu |
| `credits.confirm_on_site` | Recepcja, Trener (własne), Admin | |
| `credits.purchase_cash` | Recepcja, Admin | |
| `credits.reassign_athlete` | Owner, Admin, Sekretariat | |
| `group_swap.approve` | Owner, Admin, Sekretariat | |
| `bookings.cancel_reschedule` | Klient (własne), Admin, Sekretariat | |
| `refunds.issue` | Owner, Admin | |
| `trainers.offboard` | Owner, Admin | dezaktywacja profilu trenera |
| `sessions.mass_reassign_trainer` | Owner, Admin | masowa zmiana trenera na przyszłość (z poziomu wzorca lub ręcznie) |
| `sessions.mass_move_bookings` | Owner, Admin | przeniesienie uczestników odwoływanej sesji na inną |
| `group_types.deactivate` | Owner, Admin | dezaktywacja Definicji, blokowana przy aktywnych zależnościach |
| `locations.manage` | Owner, Admin | tworzenie/edycja/dezaktywacja lokalizacji |
| `invoices.mark_issued` | Recepcja, Admin, Owner | oznaczenie ręcznie wystawionej faktury jako rozliczonej |
| `plans.manage` (v13) | Owner platformy, Super Admin (poziom boilerplate, **nie** poziom organizacji klienta) | CRUD na `plan`/`plan_limit_definition`/`plan_feature_flag`/`organization_limit_override`. Żaden Owner/Admin akademii nie ma tego uprawnienia — wyłącznie zakup wyższego planu przez Customer Portal |
| `billing_connect.manage` (v14) | **wyłącznie Owner** organizacji (nie Admin, nie Sekretariat) | Inicjowanie/odłączanie Stripe Connect (§2.24). Świadomie węższe niż pozostałe uprawnienia finansowe w tabeli (np. `refunds.issue` ma Admin) — podłączenie konta bankowego/Stripe całej akademii jest decyzją właścicielską, nie operacyjną |
| `bookings.mark_attendance` (v15) | Trener (**wyłącznie własne sesje**), Recepcja, Admin, Owner | Oznaczanie obecności z listy uczestników sesji (§2.29, §16.1). Ograniczenie trenera do własnych sesji jest egzekwowane na backendzie, nie tylko filtrem w UI — spójnie z §4.2 |
| `trainer_rates.manage` (v15) | Owner, Admin | CRUD na `trainer_rate` (§2.30). Trener nigdy nie edytuje własnej stawki |
| `trainer_earnings.view` (v15) | Owner, Admin, Trener (**wyłącznie własne dane**) | Podgląd raportu wynagrodzeń (§2.30). Żądanie o cudze dane jest odrzucane na backendzie niezależnie od tego, co pokazuje UI |
| `client_price_override.manage` (v15) | Owner, Admin | Przyznawanie/wyłączanie indywidualnych cen klienta (§2.31). **Wymaga podania powodu** — ten sam wzorzec co `credits.manual_grant` |
| `trainer_availability.manage` (v16) | Owner, Admin | CRUD na `trainer_availability` (§2.32). Czy trener może edytować własną dostępność (dopisanie „Trener — własna") jest otwartym punktem — patrz §8 |
| `grade_fields.manage` (v16) | Owner, Admin | Definiowanie/edycja pól ocen e-dziennika, per `group_type` oraz ad-hoc per sesja (§2.33). Rozszerzenie na Trenera (wzorzec konfigurowalny) jest otwartym punktem — patrz §8 |
| `grades.enter` (v16) | Trener (**wyłącznie własne sesje**), Recepcja, Admin, Owner | Wpis wartości ocen oraz notatek o postępach z listy uczestników sesji (§2.33, §16.1). Ograniczenie trenera do własnych sesji egzekwowane na backendzie, nie tylko filtrem w UI — spójnie z `bookings.mark_attendance` i §4.2 |
| `interest.manage` (v17) | Owner, Admin, Sekretariat | Podgląd zgłoszeń zainteresowania (`interest_signup`) i **ręczna konwersja** do realnej rezerwacji po ustaleniu harmonogramu (§2.34). Ta sama grupa ról co `group_swap.approve` — obsługa wniosków klienta należy do sekretariatu |
| `member_permissions.manage` (v17) | Owner, Admin | Nadawanie/odbieranie override'ów uprawnień per membership (§2.36); **wymaga podania powodu** (pole `reason`, zapis bez niego odrzucany — wzorzec `credits.manual_grant`). Świadomie wąski krąg, jak `plans.manage`/`billing_connect.manage` — modyfikacja uprawnień personelu jest decyzją zarządczą |
| `consent_documents.manage` (v17) | Owner, Admin | CRUD wersjonowanych dokumentów zgód (`consent_document`, §2.35); ten sam wzorzec co zarządzanie `policy_document` |
| `athlete_health.view` (v17) | Trener (**wyłącznie własne sesje**), Admin, Owner — **zasięg do rozstrzygnięcia (§8)** | Podgląd danych zdrowotnych/wrażliwych uczestnika (`athlete.health_notes` i kontakt awaryjny, §2.35). Domyślnie **węższe niż cała recepcja**: RLS izoluje tenant, nie wnętrze organizacji — ograniczenie widoczności do prowadzącego + admina wymaga tej bramki (synergia z override overlay §2.36). Ostateczny zasięg → §8 |
| `data.import` (v17) | Owner, Admin | Import masowy CSV client+athlete przy onboardingu (§2.38) |
| `qualification_cards.manage` (v18) | Owner, Admin, Sekretariat | Podgląd/CRUD kart kwalifikacyjnych wypoczynku (`qualification_card`, §2.40, EPIK 41) — część rodzica i lista kart. Część zdrowotna dodatkowo bramkowana `athlete_health.view` (dane wrażliwe RODO). Ten sam krąg co `interest.manage` — obsługa dokumentacji uczestnika należy do sekretariatu |
| `qualification_card.complete_return` (v18) | Owner, Admin, **kierownik wypoczynku** — **rola/zasięg do rozstrzygnięcia (§8, #21)** | Wypełnienie części „po powrocie" karty (stan zdrowia w trakcie, zdarzenia, podpis; §2.40). Świadomie **osobne od `bookings.mark_attendance`** — to inna rola (kierownik wypoczynku) i inne dane. Egzekwowane na backendzie |
| `extra_fees.manage` (v18) | Recepcja, Admin, Owner | Tworzenie i anulowanie opłat dodatkowych ad-hoc (`extra_fee`, §2.41, EPIK 42), pojedynczo i zbiorczo. Ten sam krąg co `credits.purchase_cash`/`credits.confirm_on_site` — obsługa płatności na miejscu należy do recepcji |
| `lesson_log.manage` (v18) | Owner, Admin (wszystkie sesje) + Trener (**wyłącznie własne sesje**, backend-enforced) | Tworzenie tematu lekcji (`lesson_topic`), zadawanie pracy domowej (`homework`) oraz odznaczanie wykonania (`homework_completion`) z listy uczestników sesji (§2.42, §16.1). Ten sam wzorzec kręgu co `grades.enter` (§2.33) i `bookings.mark_attendance` (§2.29) — trener ma pełną kontrolę nad własnymi zajęciami, nic na cudzej sesji; ograniczenie egzekwowane na backendzie, nie filtrem listy w UI |

Uwaga (v17): zdanie poniżej o „mechanizmie ról custom (boilerplate §4.3)" pozostaje **planem docelowym na poziomie modelu**, ale wdrożenie langlion realizuje uprawnienia jako **statyczną mapę ról + override overlay** (`membership_permission_override`, §2.36, Rozstrzygnięcie #27), świadomie NIE budując ról custom w DB — patrz §2.36 i Constraint 14.

Świadomie nie istnieje żadne uprawnienie typu „przekrocz pojemność sesji" ani „przekrocz limit planu". Wszystkie powyższe uprawnienia definiuje się jako zestawy przypisywane do Membership boilerplate'u, zgodnie z jego mechanizmem ról custom (boilerplate §4.3) — patrz §2.19.

### 2.11 Reasygnacja: offboarding trenera, substytucja, Mass Move Bookings, dezaktywacja Definicji

**Offboarding trenera:** dezaktywacja profilu jest zablokowana, dopóki trener ma jakiekolwiek przyszłe (`start_time > now()`), nieodbyte sesje. Toast wskazuje liczbę i listę tych sesji. Admin rozwiązuje to przez Substytucję (pojedyncze sesje) lub Masową Zmianę Trenera (wiele sesji na raz) — dopiero gdy lista przyszłych sesji jest pusta, dezaktywacja się powiedzie.

**Substytucja (pojedyncza sesja):** ręczna zmiana trenera w jednej `session`, zawsze przechodząca przez constraint kolizji trenera (§5.1) — Hard Block, ten sam wzorzec co przy tworzeniu sesji.

**Masowa zmiana trenera:** aktualizacja wielu przyszłych sesji na raz. Każda sesja jest osobną transakcją — jeśli nowy trener ma kolizję w konkretnym terminie, tylko ta sesja jest pomijana, reszta jest aktualizowana. Raport zbiorczy na końcu.

**Dezaktywacja group_type:** zablokowana, dopóki: (a) którykolwiek powiązany `group_type_recurrence` ma `is_recurring=true`, lub (b) istnieją przyszłe, nieodbyte sesje tego typu. Toast wskazuje dokładnie, co blokuje.

**Dezaktywacja location:** analogicznie — ostrzeżenie z listą przyszłych, nieodbytych sesji przypisanych do tej lokalizacji, ale (w odróżnieniu od trenera i `group_type`) nie blokuje twardo, ponieważ lokalizacja jest atrybutem informacyjnym sesji, nie krytyczną zależnością silnika rezerwacji czy systemu kredytowego.

**Odwołanie sesji — dwie ścieżki:**
- **Standardowa (§14.1):** generowanie kredytów kompensacyjnych dla opłaconych uczestników.
- **Mass Move Bookings (alternatywa):** zamiast kredytów, admin przenosi wszystkich uczestników odwoływanej sesji na inną, wskazaną sesję. Dla każdego uczestnika osobno sprawdzane są capacity (§5.2) i kolizja zawodnika (§5.3). Kto się nie mieści, trafia na wyodrębnioną listę „wymaga ręcznej interwencji". Sesja docelowa musi być tego samego `group_type`.

Notification Storm: świadomie odłożone poza MVP — każda operacja masowa wysyła powiadomienia zgodnie z już istniejącymi regułami per zdarzenie (§2.16), bez dodatkowej agregacji/batchowania.

### 2.12 Lokalizacje w grafiku

Lokalizacja jest atrybutem sesji, nie osobnym bytem w hierarchii Definicja/Realizacja — nie wpływa na silnik rezerwacji, ochronę współbieżności (§5) ani system kredytowy. Jej rola: informacyjna (gdzie odbywają się zajęcia) plus filtr w grafiku i na liście sesji admina/trenera.

Dziedziczenie wartości: `group_type.default_location_id → group_type_recurrence.location_id` (jeśli ustawiona, nadpisuje domyślną) → `session.location_id` (kopiowana przy generowaniu, dalej edytowalna per-sesja). Ten sam trójstopniowy wzorzec dziedziczenia, jaki dokument już stosuje dla ceny (`group_type.price → booking.price_snapshot`) i pojemności (`group_type_recurrence.capacity → session.capacity`).

Edycja lokalizacji na poziomie wzorca w trakcie sezonu podlega dokładnie tej samej logice co edycja dnia/godziny (§3.4): aktualizacja w miejscu wszystkich przyszłych, nieodbytych sesji, pominięcie sesji z `is_manually_adjusted=true`, powiadomienie dotkniętych klientów.

### 2.13 Tryby zakupu i rozliczenia per typ grupy

`allowed_purchase_modes` odpowiada na pytanie „czy klient może zapłacić za jedne zajęcia, czy musi mieć pakiet":
- **wyłącznie `single_class`** — typowe dla lekcji próbnych/konsultacji (Availability-First, Slot-First) — klient zawsze płaci za pojedyncze wejście, nigdy nie jest kierowany do zakupu pakietu.
- **wyłącznie `package`** — typowe dla regularnych grup (Schedule-First) — klient musi najpierw kupić pakiet (jednorazowy lub subskrypcję), zanim zarezerwuje jakikolwiek termin; nie istnieje ścieżka płatności za pojedyncze zajęcia tego typu.
- **oba naraz** — klient może dopłacić jednorazowo za pojedyncze zajęcia ALBO kupić pakiet z korzystniejszą ceną jednostkową — decyzja biznesowa admina per typ grupy.

`allowed_billing_types` doprecyzowuje `package`, gdy jest dozwolony: czy dostępne mają być wyłącznie pakiety jednorazowe (`one_time`), wyłącznie subskrypcje (`recurring`), czy oba warianty równolegle.

Nieretroaktywność zmiany polityki: zmiana `allowed_purchase_modes`/`allowed_billing_types` na `group_type` wpływa wyłącznie na NOWE zakupy/checkouty inicjowane po zmianie. Nie dotyka: (a) już istniejących bookingów i ich `price_snapshot` (Zasada nadrzędna #1), (b) aktywnych subskrypcji — te odnawiają się i generują kredyty normalnie przez kolejne webhooki `invoice.paid` niezależnie od zmiany polityki, (c) rezerwacji `payment_pending` będących w toku w momencie zmiany. Sprawdzenie zgodności z aktualną polityką wykonywane jest w momencie KAŻDEJ próby nowego zakupu, nigdy tylko raz przy tworzeniu `product_template`.

### 2.14 Waluta i kwoty pieniężne

`organization.currency` (ISO 4217) jest polem wymaganym, analogicznym do `organization.timezone` — jedna akademia = jedna waluta. Wszystkie pola pieniężne w systemie są reprezentowane jako liczby całkowite w najmniejszej jednostce waluty (grosze/centy), zgodnie z tym, jak Stripe i tak oczekuje kwot (`amount`) — eliminuje to osobną warstwę konwersji i błędy zaokrągleń.

`booking.price_snapshot` zamraża walutę obowiązującą w momencie rezerwacji, nie tylko kwotę — na wypadek przyszłej zmiany `organization.currency`, żeby historyczne zamrożone ceny nigdy nie „przepłynęły" na nową walutę wstecznie.

### 2.15 Nieudana płatność subskrypcyjna

Dotychczasowy model generuje kredyty wyłącznie na `invoice.paid`. Model nie wymaga żadnej logiki cofania przy nieudanej płatności (`invoice.payment_failed`) — skoro kredyty i tak powstają dopiero po `invoice.paid`, brak tego eventu oznacza po prostu brak nowych kredytów w danym cyklu. Retry płatności pozostaje po stronie Stripe (Smart Retries).

Pole `credit_purchase.subscription_status` jest aktualizowane webhookiem i służy wyłącznie do raportowania stanu subskrypcji lokalnie, bez wpływu na już wygenerowane kredyty ani na `valid_until`. Przy `invoice.payment_failed` generowane jest powiadomienie (§2.16) z linkiem do Stripe Customer Portal.

**Kwota kolejnego cyklu a rabat klienta (v15):** wysokość obciążenia przy każdym odnowieniu zależy od stanu `client_price_override` **w momencie tego odnowienia** — rabat jest stanem żywym, nie wartością zamrożoną przy starcie subskrypcji (§2.31, Constraint 9). Cena może się zatem różnić między cyklami, jeśli admin w międzyczasie zmienił, wyłączył lub pozwolił wygasnąć rabatowi; to zachowanie oczekiwane, nie błąd. Sam mechanizm z tej sekcji pozostaje bez zmian: `subscription_status` nadal jest wyłącznie informacyjny, a kredyty nadal powstają dopiero na `invoice.paid`, niezależnie od tego, jaka kwota została naliczona.

### 2.16 Notification Center — dedykowana encja domenowa

Boilerplate dostarcza ogólny mechanizm in-app notification center dla kontekstu B2B/organizacyjnego (boilerplate §23). Langlion potrzebuje własnej, dedykowanej encji, ponieważ odbiorcami są w większości klienci akademii (rodzice), nie członkowie organizacji (Membership), a katalog zdarzeń jest domenowo specyficzny (zmiana grupy, wygasający kredyt, zwrot, zmiana lokalizacji), nie ogólny „billing/team" jak w boilerplacie.

To jest osobna tabela i osobny katalog zdarzeń (`notification_event_type`, `notification`, `notification_preference` — patrz §1.2), odwzorowany na ten sam ogólny wzorzec dostarczania co boilerplate (in-app + e-mail, preferencje per kanał).

Zasada niewyłączalności: zdarzenia finansowe/bezpieczeństwa (`payment_failed`, `refund_confirmed`, `credit_expiring_soon`) mają `is_overridable=false`.

Przykładowe mapowanie zdarzeń z dokumentu na katalog (nie wyczerpujące):

| Zdarzenie | event_type.code | is_overridable |
|---|---|---|
| Zatwierdzenie zmiany grupy (§EPIK 11) | `group_change_approved` | tak |
| Zmiana lokalizacji/godziny wzorca (§3.4/AC4, §US-22.4/AC2) | `schedule_or_location_changed` | tak |
| Odwołanie sesji przez admina (§US-19.2) | `session_cancelled` | tak |
| Zwrot potwierdzony (§US-18.2/AC3) | `refund_confirmed` | nie |
| Kredyt wygasa za 7 dni | `credit_expiring_soon` | nie |
| Częściowe auto-wypełnienie pakietu (§US-9.1/AC4) | `partial_autofill` | tak |
| Nieudana płatność subskrypcyjna (§2.15) | `payment_failed` | nie |
| Wygaśnięcie wniosku o zmianę grupy (§US-11.4/AC2) | `group_change_expired` | tak |
| Zbliżanie się do limitu planu (v13) | `plan_limit_approaching` | tak |
| Osiągnięcie limitu planu (v13) | `plan_limit_reached` | tak |
| Stripe Connect wymaga uwagi / ograniczone konto (v14) | `stripe_connect_requires_attention` | nie |
| Nowa ocena wpisana uczestnikowi (§2.33, v16) | `grade_recorded` | tak |
| Nowa notatka o postępach (§2.33, v16) | `progress_note_added` | tak |
| Nowa praca domowa zadana grupie (§2.42, v18) | `homework_assigned` | tak |
| Nowy temat lekcji (§2.42, v18) | `lesson_topic_added` | tak |
| Prośba o wypełnienie karty kwalifikacyjnej (§2.40, v18) | `qualification_card_requested` | **do rozstrzygnięcia (§8, #24)** — zależy od decyzji „blokada zapisu vs przypomnienie" (§8, #19) |
| Zmiana hasła klienta — w tym wymuszony reset przez OTP (§2.43, v19) | `client_password_changed` | nie |

Każde zdarzenie dotyczące wielu odbiorców naraz (np. odwołanie sesji) tworzy osobny rekord `notification` per odbiorca, wysyłane w ramach jednej operacji — bez dodatkowej agregacji (Notification Batching pozostaje odłożone poza MVP, patrz §6).

### 2.17 Faktury i dokumenty sprzedaży — proces ręczny

Decyzja: brak automatycznego fakturowania (Stripe Tax/Invoicing) w MVP. Jeśli klient poprosi o fakturę VAT, zespół wystawia ją ręcznie, poza systemem. System langlion jedynie odnotowuje fakt żądania i wystawienia (`invoice_requested_at`, `invoice_issued_at`, `invoice_number`, `invoice_issued_by_user_id` na `credit_purchase`) — żeby był ślad audytowy.

Potwierdzenie płatności generowane automatycznie przez Stripe (paragon/receipt) pozostaje jedynym automatycznym dokumentem. Ten mechanizm nigdy nie blokuje standardowej ścieżki zakupowej — `invoice_requested_at`/`invoice_issued_at` są polami czysto administracyjnymi.

### 2.18 Regulaminy i akceptacje — dokumenty prawne per typ grupy

Administrator przypisuje regulamin (`policy_document`) do typu grupy przy jego tworzeniu. System zapamiętuje, którą dokładnie wersję zaakceptował każdy klient przy zapisie — zgodnie z tą samą zasadą nieretroaktywności, którą dokument już stosuje dla ceny i polityki (Zasada nadrzędna #1).

Edycja treści regulaminu (nowy plik) tworzy nowy rekord/wersję `policy_document`, nigdy nie nadpisuje istniejącej. Akceptacja klienta (`policy_acceptance`) zamraża `policy_document_version` w momencie akceptacji.

`group_type` bez przypisanego `policy_document_id` pomija krok akceptacji przy formularzu rejestracji — pole jest opcjonalne na poziomie typu grupy.

### 2.19 Integracja z SaaS Boilerplate — model tożsamości (rewizja 14.1, rozszerzona 15.1)

Boilerplate'owe User/Membership/Organization (boilerplate sekcje 1, 3, 4) są modelem dla personelu akademii — Owner, Admin, Recepcja, Trener z RBAC opisanym w §2.10. Organization boilerplate'u = organization langlion (jedna akademia = jeden tenant).

Rodzice/klienci NIE korzystają z boilerplate'owego User/Membership **w żadnej formie** — to odrębna, w pełni domenowa encja `client` (§1.2). Uzasadnienie: pełna izolacja per organizacja jest twardym wymogiem biznesowym — Akademia A i Akademia B to odrębne, niepowiązane ekosystemy z perspektywy klienta; współdzielenie loginu między nimi jest niedopuszczalne, nawet jeśli dane pozostają technicznie odseparowane. To jest CZWARTY świadomy wyjątek od reguły „użyj tego, co jest w boilerplacie" (Zasada nadrzędna #5) — obok Notification Center (§2.16), modelu planów/limitów (v13) i Stripe Connect (v14); piąty (brak przełącznika organizacji, rewizja 15.1) opisany niżej.

Rekomendacja wdrożeniowa:
- Personel: boilerplate'owy User (konto, hasło, sesje — boilerplate §2) + Membership + role z §2.10 — bez żadnych modyfikacji fundamentu auth.
- Klienci: encja `client` z unikalnością `(organization_id, email)`; logowanie przez domenowy OTP/magic link scoped do `(organization_id, email)` — token jednorazowy, krótkotrwały, przechowywany wyłącznie jako hash (wzorzec identyczny jak tokeny zaproszeń boilerplate'u); kod wydany w Akademii A jest bezużyteczny w Akademii B nawet dla tego samego adresu e-mail. Sesja klienta jest osobnym mechanizmem od sesji personelu (Better Auth), scoped per organizacja.
- Relacja klienta do organizacji wynika wprost z `client.organization_id` (oraz powiązanych `athlete`/`booking`/`credit`) — klient nigdy nie otrzymuje Membership ani roli RBAC, nie ma dostępu do panelu admina.
- Role z §2.10 definiuje się jako zestaw uprawnień przypisywanych do Membership w scentralizowanej mapie RBAC boilerplate'u.
- Audit trail: langlion nie buduje własnego, drugiego audit loga — wykorzystuje wspólny hook z boilerplate §6.4, z typem wykonawcy `User` dla akcji personelu i osobnym typem dla akcji klienta.
- Storage (boilerplate §21) jest fundamentem pod `policy_document.file_id`.
- Billing (boilerplate §5, adapter Stripe) obsługuje **Platform Billing** — opłatę organizacji za plan langlion (§EPIK 29) — na koncie Stripe **platformy**, przez `organization.platform_stripe_customer_id`.
- System kredytowy (`credit_purchase`, `product_template`) oraz Zmiana Grupy (`group_change_request`) działają na osobnym, **Connected Account** akademii (§EPIK 30, v14), przez `organization.stripe_connect_account_id` — ten sam adapter Stripe boilerplate'u jest rozszerzony o obsługę Connect (Standard accounts, OAuth, webhook `account.updated`), ale operuje na całkowicie odrębnej tożsamości Stripe niż Platform Billing. Patrz Zasada nadrzędna #7.
- **Brak przełącznika organizacji (rewizja 15.1, PIĄTY świadomy wyjątek):** przełącznik kontekstu z boilerplate §3.5 (account switcher) NIE jest wykorzystywany dla langlion. Organizacja nie jest przełączalnym kontekstem w ramach jednego konta, tylko niezależną instalacją pod własną subdomeną (§2.27) — model analogiczny do Shopify, gdzie każdy sklep jest odrębną instalacją. **Jeden User może mieć Membership w wielu organizacjach, ale każda wymaga osobnej autentykacji — brak przełącznika, brak współdzielonej sesji między organizacjami.** Konsekwencja praktyczna: personel należący do wielu akademii (np. trener freelancer współpracujący z dwiema niepowiązanymi akademiami) loguje się osobno do każdej subdomeny, z osobną sesją. Cookie sesji scoped per host (bez wildcard) jest w tym modelu poprawne i wystarczające samo z siebie — to docelowy model, nie tymczasowe uproszczenie. Model danych pozostaje nietknięty: Membership w wielu organizacjach jest w pełni dopuszczalne, wyłączona jest wyłącznie ścieżka przełączania między nimi bez ponownego logowania.
- Notification Center (§2.16), **model planów/limitów (v13)**, **rozszerzenie adaptera billingowego o Stripe Connect (v14)**, **tożsamość klienta jako encja domenowa (rewizja 14.1)** oraz **brak przełącznika organizacji (rewizja 15.1)** są jedynymi świadomymi wyjątkami/rozszerzeniami reguły „użyj tego, co jest w boilerplacie" — patrz Zasada nadrzędna #5.

Tabela mapowania (skrót):

| Koncept langlion | Koncept boilerplate | Uwaga |
|---|---|---|
| organization | Organization | 1:1, jedna akademia = jeden tenant |
| Personel (Owner/Admin/Recepcja/Trener) | User + Membership + rola custom | RBAC z §2.10 jako zestawy uprawnień |
| Klient/rodzic | **żaden — domenowa encja `client`** | pełna izolacja per organizacja; czwarty świadomy wyjątek (rewizja 14.1) |
| Logowanie klienta (OTP) | **żaden — domenowy OTP scoped `(organization_id, email)`** | wzorzec tokenu jak zaproszenia boilerplate'u, ale osobny mechanizm i osobna sesja |
| RBAC | boilerplate §4 (custom roles) | |
| Audit trail | boilerplate §6.4 | wspólny hook, nie osobny log |
| Storage regulaminów | boilerplate §21 | |
| Płatności/Stripe (Platform Billing) | boilerplate §5 | wspólny adapter, konto platformy, wyłącznie §EPIK 29 |
| Notification Center | dedykowana encja, §2.16 | jedyny (do v12) świadomy wyjątek od reużycia boilerplate'u |
| **Plany/limity/featury (v13)** | boilerplate §5.2, §5.6, §5.7 (konceptualnie) | **dane w bazie zamiast configu — drugi świadomy wyjątek, patrz §EPIK 29** |
| **Stripe Connect (v14)** | boilerplate §5.1 (rozszerzony) | **adapter billingowy rozszerzony o Connected Accounts — trzeci świadomy wyjątek/rozszerzenie, patrz §EPIK 30** |
| **Tożsamość klienta (rewizja 14.1)** | boilerplate §2 (świadomie NIE reużyty dla klientów) | **encja `client` + domenowy OTP per organizacja — czwarty świadomy wyjątek** |
| **Przełącznik organizacji (rewizja 15.1)** | boilerplate §3.5 (świadomie NIE reużyty) | **piąty świadomy wyjątek: jeden User może mieć Membership w wielu organizacjach, ale każda wymaga osobnej autentykacji — brak przełącznika, brak współdzielonej sesji między organizacjami. Cookie scoped per host, bez wildcard** |

