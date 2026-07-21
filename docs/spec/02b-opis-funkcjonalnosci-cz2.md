## 2. Opis funkcjonalności — moduły (część 2: §2.20–§2.43)

Poprzednia część: [§2.1–§2.19](02a-opis-funkcjonalnosci-cz1.md). Kryteria akceptacji: [EPIK 1–20](02c-kryteria-akceptacji-epiki-1-20.md), [EPIK 21–44](02d-kryteria-akceptacji-epiki-21-44.md).

### 2.20 Egzekwowanie limitów liczbowych planu (v13)

Każda operacja tworząca zasób podlegający limitowi sprawdza PRZED zapisem: efektywny limit (§1.3, kolejność pierwszeństwa) vs. aktualne zużycie (live COUNT).

- Limit osiągnięty → operacja blokowana (toast) z aktualnym zużyciem i CTA „Przejdź na wyższy plan" — ten sam wzorzec Blokady co Zasada nadrzędna #4, egzekwowany **na backendzie**, niezależnie od UI (spójne z RBAC §4.2).
- Sprawdzenie zawsze na żywo (COUNT), nie przez utrzymywany licznik — przy typowej skali akademii pozaszkolnej (dziesiątki–setki rekordów) jest to wystarczająco wydajne i eliminuje ryzyko rozjazdu licznika. Utrzymywany licznik jako optymalizacja wydajności jest świadomie odłożony poza MVP (§6).
- **Brak** blokady bazodanowej (`FOR UPDATE`) na sprawdzeniu limitu, w odróżnieniu od ochrony race condition z §5. Uzasadnienie: dodawanie uczniów/grup/trenerów to rzadkie, ręczne akcje administracyjne, więc przejściowe przekroczenie limitu o pojedynczy rekord jest akceptowalnym ryzykiem biznesowym, tańszym niż dodatkowa infrastruktura blokad.

Przykładowa tabela kluczy limitów (rozszerzalna, nie wyczerpująca):

| limit_key | Co liczy (live COUNT) | Moment sprawdzenia |
|---|---|---|
| `max_students` | `COUNT DISTINCT athlete` gdzie `athlete.parent_client_id → client.organization_id = X` | przy tworzeniu `athlete` (§US-4.1, w tym dopisanie kolejnego dziecka do istniejącego profilu rodzica) |
| `max_groups` | `COUNT group_type` gdzie `organization_id=X AND is_active=true` | przy tworzeniu/aktywacji `group_type` |
| `max_trainers` | `COUNT` aktywnych Membership z rolą trenerską | przy zapraszaniu/aktywacji trenera |
| `max_locations` | `COUNT location` gdzie `organization_id=X AND is_active=true` | przy tworzeniu `location` |
| `max_sessions_per_month` *(opcjonalnie)* | `COUNT session` wygenerowanych w bieżącym miesiącu kalendarzowym | przy generowaniu sesji (§3.1) |

### 2.21 Feature gating (widoczność funkcji per plan) (v13)

`plan_feature_flag` sprawdzany w dwóch miejscach — ten sam wzorzec co RBAC §4.2:

- **UI:** funkcja niedostępna w planie jest oznaczona jako „wymaga planu X" z CTA upgrade, a nie całkowicie ukryta — element sprzedażowy, widoczność buduje świadomość oferty.
- **Backend:** każda akcja API sprawdza `feature_key` niezależnie od UI, zwraca błąd z informacją o wymaganym planie.
- Brak wpisu `plan_feature_flag` dla pary `(plan, feature_key)` = fail-closed, spójnie z limitami liczbowymi.

Feature gating i polityka grupy (§2.13, `allowed_purchase_modes`/`allowed_billing_types`) to **dwa niezależne mechanizmy**: plan organizacji określa, co akademia w ogóle ma odblokowane, polityka grupy określa, co klient końcowy może kupić w ramach tego, co akademia odblokowała.

### 2.22 Zmiana planu (upgrade/downgrade) (v13)

- Zmiana planu przechodzi przez adapter billingowy boilerplate'u (§5.3–§5.5): Stripe Checkout dla upgrade, Customer Portal dla zmiany/anulowania. `organization.plan_id` aktualizowany webhookiem `customer.subscription.updated`, tym samym mechanizmem i tą samą idempotencją co już ustalona dla subskrypcji kredytowych (§12.3).
- **Upgrade:** nowe, wyższe limity obowiązują natychmiast po webhooku.
- **Downgrade** poniżej aktualnego zużycia: sam downgrade **nie jest blokowany** — konsekwentnie z Zasadą nadrzędną #4. Istniejące zasoby ponad nowy limit pozostają w pełni aktywne (żaden uczeń/grupa nie jest usuwana automatycznie). Blokowane są wyłącznie **nowe** operacje tworzące zasób tego typu, dopóki liczba nie spadnie poniżej limitu lub organizacja nie wróci na wyższy plan.
- Po downgrade generowane jest powiadomienie (Notification Center, §2.16) do Ownera/Admina organizacji z listą przekroczonych limitów — informacyjnie, nieblokująco.

### 2.23 Konfiguracja bez deploya (v13)

- Super Admin (boilerplate §6) otrzymuje widok „Plany i limity": CRUD na `plan`, `plan_limit_definition`, `plan_feature_flag`, `organization_limit_override`.
- Edycja `limit_value` na istniejącym planie wpływa **natychmiast** na wszystkie organizacje przypisane do tego planu (limit liczony na żywo, nie cache'owany trwale) — świadomie inaczej niż `price_snapshot` (Zasada nadrzędna #1), ponieważ limit planu to bieżący stan uprawnień, nie zamrożona transakcja; dla wynegocjowanych, niezmiennych warunków służy `organization_limit_override`.
- Każda zmiana w `plan_limit_definition`/`plan_feature_flag` logowana w audit trail (boilerplate §6.4, wykonawca typu `SuperAdmin`, stara → nowa wartość).

### 2.24 Podłączenie Stripe Connect (v14)

Owner organizacji łączy własne konto Stripe akademii z poziomu panelu (sekcja „Płatności"), przyciskiem „Połącz Stripe". Wykorzystywany jest wzorzec **Standard Connect** (nie Express, nie Custom) — akademia zakłada/łączy swoje w pełni samodzielne konto Stripe, które sama zarządza (spory, KYC, wypłaty, podatki), a platforma jedynie inicjuje płatności w jej imieniu. Ten wybór minimalizuje odpowiedzialność i zakres regulacyjny platformy (patrz §7 rozstrzygnięte decyzje) kosztem nieco mniej płynnego onboardingu niż Express — świadomy kompromis dla platformy B2B, gdzie każdy klient to realna firma (akademia), nie pojedynczy freelancer.

Przepływ:
1. Owner klika „Połącz Stripe" → backend tworzy (lub odnajduje) Standard Connected Account i generuje link OAuth do Stripe.
2. Owner jest przekierowywany na Stripe, gdzie loguje się do istniejącego konta Stripe akademii lub zakłada nowe, i autoryzuje połączenie.
3. Stripe przekierowuje z powrotem do panelu z kodem autoryzacyjnym; backend wymienia go na `stripe_connect_account_id` i zapisuje na `organization`.
4. `organization.stripe_connect_status` startuje jako `onboarding_incomplete`, dopóki Stripe nie potwierdzi kompletu wymaganych danych (weryfikacja tożsamości/firmy) — status aktualizowany wyłącznie webhookiem `account.updated`, nigdy przez sam fakt przekierowania (ten sam wzorzec „webhook jako źródło prawdy", co przy płatnościach online w §2.7/§6.3 — redirect nie jest dowodem stanu).
5. Gdy Stripe potwierdza `charges_enabled=true`, `stripe_connect_status → active` i `stripe_connect_connected_at` jest ustawiane (jeśli puste).

### 2.25 Bramka: płatności online wymagają aktywnego Connect (v14)

Dopóki `organization.stripe_connect_status != active`:
- `group_type.payment_policy` nie pozwala zaznaczyć opcji „online" — w UI opcja jest widoczna, ale zablokowana z komunikatem „Połącz Stripe, aby przyjmować płatności online", z CTA prowadzącym do §2.24.
- Tworzenie/edycja `product_template` z płatnością online jest blokowane analogicznie.
- Backend odrzuca każdą próbę wygenerowania Stripe Checkout/PaymentIntent dla tej organizacji, niezależnie od tego, co dopuszcza UI — ten sam wzorzec co RBAC (§4.2) i limity planu (§2.20): backend jest ostatecznym źródłem prawdy, blokada UI jest kosmetyczna.
- Płatność na miejscu (`cash`) pozostaje w pełni dostępna niezależnie od statusu Connect — nowa akademia może zacząć sprzedawać zajęcia od pierwszego dnia, zanim dokończy weryfikację Stripe.

Jeśli Stripe później oznaczy konto jako `restricted` (np. Stripe zażądał dodatkowych dokumentów) poprzez webhook `account.updated`, `stripe_connect_status → restricted` i te same blokady zaczynają obowiązywać ponownie — konsekwentnie z Zasadą nadrzędną #4 (blokada nowych operacji, nie kasowanie istniejących): rezerwacje i subskrypcje już istniejące na Connected Account nie są przerywane (to sprawa między akademią a Stripe), ale nowe checkouty inicjowane przez langlion są wstrzymane, dopóki status nie wróci do `active`.

### 2.26 Powiadomienia i widoczność statusu (v14)

- Zmiana `stripe_connect_status` na `restricted` lub `disabled` generuje powiadomienie `stripe_connect_requires_attention` (Notification Center, §2.16, `recipient_type=staff`, do Ownera/Admina) z linkiem do panelu Stripe, gdzie akademia uzupełnia brakujące dane.
- Panel Ownera pokazuje stały wskaźnik statusu Connect (aktywne / wymaga uwagi / niepołączone) niezależnie od tego, czy powiadomienie zostało przeczytane — status jest zawsze widoczny, nie tylko zdarzeniowo zgłaszany.
- Odłączenie Connected Account (Owner odłącza ręcznie, albo Stripe usuwa konto) jest traktowane tak samo jak `restricted` — blokada nowych płatności online, bez wpływu na dane historyczne.

### 2.27 Adresowanie: subdomena akademii i slug oferty (rewizja 14.2, zaktualizowana 2026-07-20)

System operuje **dwoma kontekstami domenowymi** o różnym przeznaczeniu:

| Kontekst | Adres | Co tam żyje |
|---|---|---|
| Platforma (operator langlion) | `langlion.pl` | marketing produktu langlion, onboarding nowej akademii (rejestracja + wybór `organization.subdomain`), panel Super Admina (cross-tenant z definicji, nie może żyć pod pojedynczą subdomeną) |
| Akademia — wszystko | `{organization.subdomain}.langlion.pl` | publiczna strona (Payload, wg `page.slug`), dashboard personelu (`/dashboard`), panel CMS (`/admin`), zapisy klienta (`/zapisy/{group_type.slug}`) |

`organization.subdomain` pozostaje globalnie unikalny (wymóg DNS), zgodnie z dotychczasową walidacją (RFC 1035, 3–63 znaki, lista zarezerwowanych nazw subdomen: `www`, `api`, `admin`, `cdn`…). `group_type.slug` pozostaje unikalny **per `organization_id`** — jedna akademia prowadzi równolegle wiele aktywnych ofert (§EPIK 2, US-2.3), a dwie różne akademie mogą zasadnie prowadzić ofertę o tej samej nazwie.

`organization.slug` w dotychczasowej roli identyfikatora panelu personelu (`/orgs/{slug}`) **jest wycofywany**. Jeśli potrzebny jest wewnętrzny identyfikator do URL-i Super Admina (operujących cross-tenant, gdzie subdomena nie ma zastosowania), `organization.slug` może zostać zachowany wyłącznie w tej roli — do potwierdzenia przy implementacji panelu Super Admina.

**Kolizje ścieżek:** ponieważ dashboard/admin i strony CMS współdzielą tę samą subdomenę, `page.slug` nie może kolidować z zarezerwowanymi ścieżkami aplikacji. Lista zarezerwowanych sluggów żyje w jednym pliku źródłowym (`src/features/cms/reserved-slugs.ts` lub analogiczny), importowanym zarówno przez middleware (rozstrzyganie: trasa aplikacji czy strona CMS), jak i przez walidację formularza tworzenia strony w panelu CMS. Startowa lista: `dashboard`, `admin`, `api`, `zapisy`, `login`, `logout`.

**Middleware rozpoznający tenanta z subdomeny** obsługuje teraz zarówno żądania do aplikacji (dashboard/admin), jak i żądania do publicznych stron CMS — jeden punkt rozpoznania `Host` → `organization_id`, z rozgałęzieniem po prefiksie ścieżki (zarezerwowana ścieżka → routing aplikacji; wszystko inne → wyszukanie `page` po slugu i renderowanie przez Payload). Nadal nie jest częścią Fazy 0 — blokuje przed EPIK 4 (publiczna rejestracja klienta) i przed modułem CMS (`docs/specyfikacja-cms.md`), nie blokuje wcześniejszych faz.

### 2.28 Nazewnictwo encji `session` w implementacji (rewizja 14.2)

Encja opisywana w tym dokumencie jako `session` (Realizacja, §1.2) nosi w implementacji nazwę **`class_session`** (stała TS `classSession`). Powód jest zewnętrzny wobec domeny: fundament boilerplate'owy (Better Auth) zajmuje nazwę `session` na sesje logowania personelu — zarówno tabelę SQL, jak i eksport TS.

Kolizja nie jest głośna: `export *` z dwóch modułów eksportujących tę samą nazwę czyni ją niejednoznaczną, a moduły ES rozwiązują to przez ciche pominięcie. W praktyce oznaczało to, że generator migracji pominął tabelę domenową, generując jednocześnie klucz obcy z `booking` wskazujący na tabelę sesji logowania. Zmiana nazwy jest świadomym odejściem od dosłownego brzmienia specyfikacji; **każde odwołanie do `session` w tym dokumencie oznacza `class_session` w kodzie**.

### 2.29 Potwierdzanie obecności (v15)

Obecność jest **osobną osią od płatności**. Dotychczasowy `booking.payment_status` odpowiada na pytanie „czy i jak zapłacono"; nowe `attendance_status` odpowiada na pytanie „czy uczestnik faktycznie przyszedł". Te dwie odpowiedzi bywają dowolną kombinacją: klient opłacony może nie przyjść, klient z `booked_offline` może przyjść i zapłacić dopiero po zajęciach.

Wartość `no_show` na `payment_status` (§US-16.2) **zostaje bez zmian i nie jest z tym mechanizmem synchronizowana** w żadną stronę. Świadomie nie łączymy tych pól ani nie migrujemy jednego w drugie: `payment_status=no_show` niesie skutek rozliczeniowy (rezerwacja się nie odbyła, a kredyt został skonsumowany), natomiast `attendance_status` jest czystym faktem frekwencyjnym bez żadnych konsekwencji.

Stan domyślny to `unmarked`, celowo odróżnialny od `absent`: „nikt nie sprawdził listy" to inna informacja niż „sprawdzono i uczestnika nie było". Raport wynagrodzeń (§2.30) opiera się dokładnie na tym rozróżnieniu, a przyszłe raporty frekwencji straciłyby sens, gdyby brak oznaczenia był nie do odróżnienia od nieobecności.

Oznaczanie odbywa się z listy uczestników sesji (§16.1), wymaga uprawnienia `bookings.mark_attendance` i jest logowane w audit trail (boilerplate §6.4) — łącznie z nadpisaniem wcześniejszego oznaczenia, tak aby dało się odtworzyć, kto i kiedy zmienił zdanie. Oznaczenie obecności **nie wywołuje żadnej automatycznej konsekwencji**: nie zwraca kredytu, nie zmienia statusu płatności, nie generuje powiadomienia. Jest to spójne z obecnym traktowaniem `no_show` (§US-16.2).

UI raportów i analityki frekwencji pozostaje poza zakresem v15 — ta sekcja dostarcza wyłącznie surowe dane, na których taki raport w przyszłości się oprze.

### 2.30 Wynagrodzenia trenerów — wyłącznie informacyjne (v15)

Moduł **nie jest systemem payrollowym**. Nie tworzy żadnej płatności, przelewu ani wypłaty; nie dotyka żadnego z dwóch kont Stripe (Zasada nadrzędna #7) — ani Platform Billing, ani Connected Account akademii. Jest to kalkulator raportowy: liczy, ile akademia jest winna trenerowi, a rozliczenie odbywa się poza systemem.

`trainer_rate.amount` to **ryczałt za poprowadzoną sesję**, niezależny od liczby uczestników i długości zajęć (Rozstrzygnięcie #18). Stawka może być bazowa (`group_type_id = NULL`) albo nadpisana per typ grupy — nadpisanie wygrywa, wg Constraint 8.

Zmiana stawki **nigdy nie działa wstecz**: tworzy nowy rekord z własnym `effective_from`, a raport za miniony okres liczy stawkę obowiązującą w dniu sesji. To ten sam wzorzec nieretroaktywności, który dokument stosuje dla ceny (Zasada nadrzędna #1) i wersji regulaminu (§2.18) — podwyżka od nowego sezonu nie przepisuje rozliczenia poprzedniego.

Kwalifikacja sesji do raportu wymaga **dwóch warunków naraz**:
1. trener prowadził tę sesję (`session.trainer_id`), oraz
2. przynajmniej jedna powiązana `booking` ma `attendance_status != 'unmarked'`.

Drugi warunek jest celowym proxy dla „zajęcia faktycznie się odbyły i prowadzący je rozliczył". Sesja wygenerowana z wzorca, na której nikt nigdy nie sprawdził listy, nie wchodzi do sumy — brak oznaczeń jest sygnałem, że nie ma czego rozliczać, a nie zaproszeniem do zgadywania. Wartość `absent` liczy się na równi z `present`: prowadzący pojawił się i sprawdził listę, więc należy mu się stawka niezależnie od tego, ilu uczestników dotarło.

Sesje kwalifikujące się z punktu 1 i 2, dla których Constraint 8 nie rozstrzyga żadnej stawki, trafiają na **wyodrębnioną listę „brak stawki"** — nie są liczone jako zero i nie znikają cicho z raportu. To luka w konfiguracji, którą admin ma zobaczyć i uzupełnić.

Trener widzi wyłącznie własne dane (`trainer_earnings.view`), co jest egzekwowane na backendzie niezależnie od UI.

### 2.31 Indywidualne ceny klienta (v15)

`client_price_override` obsługuje sytuację, która dziś dzieje się poza systemem: rodzic dzwoni lub pisze, negocjuje zniżkę (rodzeństwo, trudna sytuacja, klient długoletni), a akademia się zgadza. Przepływ jest **w pełni ręczny i inicjowany wyłącznie przez admina** po kontakcie odbytym poza systemem.

Czego świadomie **nie ma**:
- **żadnego samoobsługowego formularza zgłoszenia rabatu** po stronie klienta — klient nie ma ścieżki UI ani API, żeby o rabat poprosić lub go zastosować;
- **żadnego kodu promocyjnego** — nie ma czego wpisać przy zakupie;
- **żadnej widoczności dla innych klientów** tej samej grupy — rabat przyznaje się z profilu konkretnego klienta, nigdy z poziomu `group_type`, więc nie jest ofertą, tylko ustaleniem indywidualnym.

Rabat stosuje się **automatycznie** do każdego pasującego zakupu tego klienta, bez żadnej akcji z jego strony. Zasięg rozstrzyga `group_type_id`: ustawione = wyłącznie ta oferta, puste = wszystkie oferty akademii (Constraint 9).

**Rabat nie jest powiązany z „pierwszym zapisem" klienta.** `client_id` powstaje raz, przy pierwszej próbie zapisu (upsert, §US-4.1), ale admin przyznaje rabat w dowolnym momencie po weryfikacji klienta — nie tylko wokół tego pierwszego zdarzenia. Od chwili przyznania rabat obowiązuje na **wszystkie kolejne rozpoznania** tego klienta: kolejny zapis, dopisanie następnego dziecka, nowy sezon — aż do wygaśnięcia (`valid_until`) albo wyłączenia (`is_active=false`).

**Zasięg cenowy:** rabat obejmuje zarówno `group_type.price` (pojedyncze zajęcia → `booking.price_snapshot`), jak i `product_template.price` (pakiety → `credit_purchase.price_paid`), w tym pakiety z `billing_type=recurring`. Formuła zwrotu (§2.9) liczy się wtedy od kwoty **faktycznie zapłaconej**, nie katalogowej — `price_paid` już zawiera rabat, więc formuła nie wymaga żadnej korekty.

**Widoczność ceny przy zapisie:** cena po rabacie jest pokazywana rozpoznanemu, zweryfikowanemu klientowi już na formularzu rejestracji — zarówno dla pojedynczych zajęć, jak i na liście pakietów — zanim wybierze metodę płatności (§US-4.2/AC4–AC6). Rabat naliczany bez uprzedzenia, widoczny dopiero po zapłacie, byłby gorszym doświadczeniem niż jego brak.

**Zachowanie przy subskrypcjach — rabat jako stan żywy (Rozstrzygnięcie #17):** każde odnowienie (webhook `invoice.paid`, §2.15) sprawdza aktywny override **w momencie odnowienia**; rabat nie jest zamrażany przy starcie subskrypcji. Konsekwencje, wszystkie zamierzone:
- cena subskrypcji **może się zmieniać między cyklami rozliczeniowymi**, jeśli admin zmieni lub wyłączy override w międzyczasie — to zachowanie oczekiwane, nie błąd;
- rabat z ustawionym `valid_until` **wygasa automatycznie**: pierwsze odnowienie po tej dacie nalicza już pełną cenę katalogową, bez żadnej dodatkowej akcji admina;
- **klient nie otrzymuje powiadomienia** o wygaśnięciu rabatu — świadomie pominięte na tym etapie (patrz §6).

To ten sam wzorzec „sprawdzane na żywo, nie cache'owane", który dokument stosuje już dla `plan_limit_definition` (§EPIK 29, §2.23), i świadomie inny niż zamrażanie z Zasady nadrzędnej #1 — bo rabat jest bieżącym stanem uprawnienia klienta, a nie zamkniętą transakcją. Zamrożenie nadal obowiązuje dla zakupów jednorazowych: `price_snapshot` i `price_paid` raz zapisane nie zmieniają się nigdy (§1.3).

Przyznanie rabatu wymaga uprawnienia `client_price_override.manage` **oraz podania powodu** (pole `reason`, zapis bez niego jest odrzucany) i jest logowane w audit trail — ten sam wzorzec kontroli co przy ręcznym nadaniu kredytów (§US-7.3).

**Mechanizm synchronizacji ceny na aktywnych subskrypcjach (v15, Rozstrzygnięcie #20):**

Ponieważ `product_template.stripe_price_id` reprezentuje stałą cenę katalogową na Connected Account, a rabat jest stanem żywym (wyżej, Rozstrzygnięcie #17), naliczanie ceny na subskrypcji nigdy nie odbywa się przez ten zapisany `stripe_price_id`, gdy dotyczy klienta z aktywnym override'em — zamiast tego backend tworzy/aktualizuje pozycję subskrypcji ad-hoc przez `price_data` ze Stripe, z `unit_amount` przeliczonym po stronie langlion.

Dwa niezależne triggery synchronizacji:
1. **Zmiana `client_price_override`** (utworzenie, zmiana wartości, wyłączenie, wygaśnięcie) — dla klienta z aktywną subskrypcją `recurring` na pasujący `group_type`, job w tle aktualizuje `subscription_item` przez `price_data`, `proration_behavior: none`.
2. **Zmiana `group_type.price` lub `product_template.price`** — dla WSZYSTKICH klientów z aktywnym override'em typu `percent_discount` na ten `group_type` (typ `fixed_price` jest z definicji odporny na zmianę ceny katalogowej), job przelicza i aktualizuje `unit_amount` analogicznie. Bez tego triggera rabat procentowy „zamrażałby się" po cichu na starej cenie katalogowej przy każdej podwyżce/obniżce.

Oba triggery używają tego samego zadania w tle, kolejkowanego per `(client_id, credit_purchase_id)` — patrz Constraint 10 (§1.3) dla ochrony przed race condition.

**Constraint 10 (v15) — determinizm synchronizacji ceny na subskrypcji:** dwie niemal równoczesne zmiany wpływające na tę samą parę `(client_id, credit_purchase_id)` (np. admin dwukrotnie zapisuje override, albo zmiana override'a zbiega się ze zmianą ceny katalogowej) muszą się serializować, nie race'ować o to, która wersja przeliczonej ceny zostanie ostatecznie wysłana do Stripe. Realizacja: `SELECT ... FOR UPDATE` na `client_price_override` w transakcji budującej payload synchronizacji, oraz kolejkowanie samych zadań sync per `(client_id, credit_purchase_id)` (ten sam wzorzec deduplikacji jak przy idempotencji webhooków, §12.3/§2.7) — kolejna zmiana nie synchronizuje się, dopóki poprzednia synchronizacja tej samej pary się nie zakończy.

### 2.32 Dyspozycyjność trenerów (v16)

Dotychczas (§2.1) silniki **Availability-First** i **Slot-First** nie mają żadnego pojęcia dostępności trenera z góry — jedyną ochroną jest reaktywny exclusion constraint (§5.1), więc klient w formularzu Slot-First musi zgadywać wolne godziny zamiast widzieć realne sloty. `trainer_availability` (§1.2) domyka tę lukę jako **warstwa podpowiedzi**, nie jako nowe źródło prawdy o zajętości.

Model: cotygodniowe okna `(trainer_id, day_of_week, start_time, end_time)` interpretowane w `organization.timezone` (jak `group_type_recurrence`), opcjonalnie zawężone do lokalizacji (`location_id`). Zarządzane z panelu (uprawnienie `trainer_availability.manage`, §2.10).

**Slot-First (silnik 3) — właściwy cel biznesowy:** dla wybranego dnia i `group_type` system liczy dostępne sloty dokładnie wg **Constraint 11**: okna dostępności kwalifikujących się trenerów MINUS ich istniejące `class_session` tego dnia (cały grafik trenera, nie tylko ten typ), pocięte na starty co `group_type.default_duration_minutes`. Suma po trenerach = sloty pokazywane klientowi w formularzu. To wyłącznie odczyt/podpowiedź — faktyczny zapis nadal przechodzi przez Constraint 1 (§5.1) jako ostateczną ochronę przed kolizją (dwóch klientów może kliknąć ten sam slot niemal jednocześnie — wygrywa jedna transakcja).

**Availability-First (silnik 2):** admin tworzy sesję ręcznie — dostępność trenera jest tu **miękkim ostrzeżeniem w UI**, nie twardą blokadą. Twardą blokadą zostaje wyłącznie constraint kolizji z §5.1 („Hard Block" już opisany dla tego silnika w §2.1) — admin może świadomie utworzyć sesję poza zadeklarowanym oknem, otrzymując ostrzeżenie.

**Fail-safe granica domyślna (nie fail-open na dobę):** brak jakiegokolwiek okna `trainer_availability` dla trenera nie blokuje sprzedaży (spójnie z fail-open Constraint 9), ale też nie oznacza „wolny 24/7". Domyślną górną/dolną granicą slotów są godziny pracy; **umiejscowienie tej konfiguracji (`location.opening_hours` vs `organization.default_business_hours`) jest otwartym punktem — patrz §8.** Dostępność, jeśli zdefiniowana, dodatkowo zawęża tę granicę.

**Pola `group_type.default_duration_minutes`/`default_capacity` (v16):** Slot-First i Availability-First tworzą sesję w locie, bez `group_type_recurrence` (tam żyją `duration`/`capacity`), a mimo to muszą wiedzieć, ile ma trwać sesja i jaką ma mieć pojemność. Te dwa pola dostarczają tych wartości wyłącznie silnikom bez wzorca; Schedule-First nadal bierze je z wzorca. Ten sam wzorzec dziedziczenia co `group_type_recurrence.capacity → session.capacity`.

UI podpowiedzi slotów oraz zagregowana prezentacja dostępności pozostają wąskie na tym etapie — ta sekcja dostarcza model i regułę liczenia (Constraint 11), na których formularz Slot-First się oprze.

### 2.33 E-dziennik: oceny i notatki o postępach (v16)

E-dziennik **nie jest nową osią obok obecności** (§2.29) — to rozszerzenie tej samej listy uczestników sesji (§16.1) o dwie kolejne, opcjonalne sekcje obok „Szczegółów lekcji" i „Obecności": **„Oceny"** i **„Notatki dotyczące postępów"**. Ten sam nośnik UI (lista uczestników), ten sam wzorzec uprawnień co `bookings.mark_attendance` (§2.10).

**Oceny (`grade_field`, `grade`):** personel definiuje konfigurowalne pola ocen **per `group_type` (szablon dziedziczony przez sesje)** albo **ad-hoc per pojedyncza sesja** (`session_id`), zgodnie z Constraint 12 — nigdy oba naraz na jednym wierszu (CHECK XOR w bazie). Dla każdego uczestnika prowadzący wpisuje wartość z komentarzem (np. „Kartkówka"). Wpis wymaga uprawnienia `grades.enter`; trener oznacza wyłącznie własne sesje, egzekwowane na backendzie (nie filtrem listy w UI), spójnie z §16.1/§4.2. Każdy wpis i nadpisanie są logowane w audit trail — wcześniejsza wartość pozostaje odtwarzalna (jak przy `attendance_status`, §2.29). Pełny katalog typów pól ocen i zakres UX konfiguracji (per group_type vs per sesja w praktyce) jest otwartym punktem — patrz §8.

**Notatki o postępach (`progress_note`):** wolny tekst (tytuł + treść) przypisany do uczestnika, **niepowiązany z konkretną oceną** — pochwała, uwaga, obserwacja. Opcjonalnie osadzony w kontekście sesji (`session_id`).

**Niezależność osi (Constraint 12):** oś e-dziennika jest całkowicie rozłączna od `booking.payment_status` i `booking.attendance_status`. Wpis lub edycja oceny/notatki **nie wywołuje żadnej automatycznej konsekwencji** poza jedną: **powiadomieniem klienta** o nowej ocenie/notatce (zdarzenia `grade_recorded`/`progress_note_added`, §2.16, `is_overridable=tak`). W szczególności ocena/notatka nie zmienia statusu płatności ani obecności, nie zwraca kredytu, nie zmienia statusu rezerwacji; a oznaczenie obecności ani zmiana płatności nigdy nie tworzą i nie ruszają oceny/notatki — w obie strony. To ten sam wzorzec „osobna oś", który dokument stosuje w §2.29 dla obecności.

**Widoczność u klienta:** klient widzi wpisane oceny i notatki swojego dziecka w panelu klienta. **Warunek widoczności sekcji** (zawsze gdy istnieje ≥1 wpis, czy analogicznie do widoczności portfela kredytów przy niezerowym saldzie z §7.6) jest otwartym punktem — patrz §8 i US-35.6. Powiadomienie o nowej ocenie idzie **e-mailem od razu** (bez czekania na Notification Center); pełna integracja z katalogiem in-app dochodzi razem z EPIK 26 (§2.16). Zagregowana prezentacja/analityka ocen pozostaje poza zakresem v16 — ta sekcja dostarcza wyłącznie surowe dane.

### 2.34 Zapisy przed ustaleniem harmonogramu (interest signup, v17)

Dotychczas silnik Schedule-First (§2.1) wymaga, by `group_type_recurrence` niósł `day_of_week`/`start_time`/`trainer_id` od razu, a formularz publiczny (EPIK 4) zakłada istnienie konkretnej `session` do zarezerwowania. Nie ma więc miejsca na scenariusz „zbieram zainteresowanie, harmonogramu jeszcze nie ma" — akademia często najpierw sprawdza, ile jest chętnych, i dopiero na tej podstawie układa realny grafik. `interest_signup` (§1.2) domyka tę lukę.

**Model (Rozstrzygnięcie #25):** świadomie **nowa, wąska encja** `interest_signup`, nie rozluźnianie wymagalności pól `group_type_recurrence`. Uzasadnienie: rozluźnienie zrobiłoby `day_of_week`/`start_time`/`trainer_id` nullable i wymusiłoby status na `group_type`, dotykając generowania sesji (§2.2) i ryzykując retrofit constraintów §5; osobna encja jest additive i zostawia silnik nietknięty. `group_type.status = collecting_interest` steruje wyłącznie tym, czy strona publiczna renderuje kalendarz sesji, czy formularz zainteresowania.

**Zawsze bezpłatne do momentu realnej rezerwacji:** zgłoszenie zainteresowania **nie zajmuje miejsca, nie konsumuje kredytu i nie pobiera płatności**. Uzasadnienie: dopóki nie ma sesji, nie ma miejsca do zajęcia — żaden constraint §5 ani kredyt nie ma zastosowania, a pobranie płatności bez zagwarantowanego miejsca byłoby sprzeczne z zasadą „miejsce po opłaceniu" (§4). `interest_signup` jest leadem, nie rezerwacją.

**Konwersja — ręczna przez admina (Rozstrzygnięcie #25):** po ustaleniu harmonogramu (utworzeniu wzorca/sesji) admin **ręcznie przenosi** każdego zainteresowanego do realnej rezerwacji, dokładnie tym samym mechanizmem co Dopisanie (§2.7, Proces A), przez **pełną ochronę §5** (pojemność §5.2, kolizja zawodnika §5.3). Świadomie nie samoobsługa: akademia kontroluje moment i skład realnych grup. Utworzona `booking` domyka ślad przez `interest_signup.converted_booking_id`/`converted_at`. Uprawnienie: `interest.manage` (§2.10). Ponowne zgłoszenie tego samego dziecka do tej samej oferty jest no-opem (Constraint 13).

UI listy zgłoszeń i masowa konwersja pozostają wąskie na tym etapie — ta sekcja dostarcza model i ścieżkę konwersji, na których panel admina się oprze.

### 2.35 Profil uczestnika: dane zdrowotne, kontakt awaryjny, wersjonowane zgody (v17)

Dotychczas `athlete` nosi wyłącznie `name`+`age` (§1.2). Akademia sportowo-obozowa realnie potrzebuje informacji zdrowotnych istotnych dla bezpieczeństwa (alergie, przeciwwskazania), kontaktu awaryjnego oraz zgód (np. na wizerunek) — dziś zbieranych poza systemem.

**Zakres (Rozstrzygnięcie #26) — pełny, nie minimalny:** płaskie pola bezpieczeństwa na `athlete` (`emergency_contact_name`/`_phone`, `health_notes`) **oraz** osobny, **wersjonowany** byt zgód (`consent_document`/`athlete_consent`) analogiczny do `policy_document`/`policy_acceptance` (§2.18). Uzasadnienie osobnego bytu: zgoda na wizerunek ma walor prawny wymagający wersji i śladu (kto/kiedy/którą wersję/`ip`), którego wolne pole na `athlete` nie zapewnia. Nieretroaktywność zgód: §1.3 (Zasada) — edycja treści zgody tworzy nową wersję, nie rusza wstecz złożonych akceptacji.

**Opcjonalność i moment zbierania:** pola profilu są **opcjonalne przy zapisie** (US-4.1) i uzupełnialne później z panelu klienta. Zgoda z `is_required_at_signup=true` jest krokiem obowiązkowym formularza — czy **blokuje twardo** zapis, czy tylko **odnotowuje odmowę** (`granted=false`), jest otwartym punktem (§8).

**Dane wrażliwe — widoczność i szyfrowanie (otwarty punkt §8):** RLS izoluje dane per tenant, ale to **nie to samo** co ograniczenie widoczności wewnątrz organizacji. `health_notes` i kontakt awaryjny są danymi wrażliwymi — proponowane ograniczenie widoczności do **trenera prowadzącego + admina** (nie całej recepcji) przez bramkę `athlete_health.view` (§2.10), z synergią z override overlay (§2.36), oraz ewentualne szyfrowanie w spoczynku — do rozstrzygnięcia przed fazą (§8). Uprawnienie do CRUD dokumentów zgód: `consent_documents.manage`.

### 2.36 Granularne uprawnienia personelu — override overlay (v17)

Konkurencja (ActiveNow) pozwala nadać każdemu recepcjoniście osobny zestaw uprawnień. Langlion ma dziś statyczną, predefiniowaną mapę ról (Rozstrzygnięcie #4 planu implementacji: `owner`/`admin`/`reception`/`trainer`/`secretariat` ze stałym zestawem uprawnień), świadomie odrzucając mechanizm ról custom z boilerplate §4.3.

**Kompromis (do jawnego rozważenia — pełny powrót do ról custom vs węższy mechanizm override):**
- **Pełny powrót do ról custom w DB (boilerplate §4.3):** DB-backed mapa `rola→uprawnienie`, `membership.role` → `custom_role_id`. Zastępuje statyczną mapę w całości; **cofa Rozstrzygnięcie #4**; największy blast radius (dotyka każdej ścieżki `requireOrgPermission`).
- **Override overlay (wybrany, Rozstrzygnięcie #27):** nowa encja `membership_permission_override` (grant/revoke per membership) **nakładana NA** statyczną rolę bazową. Rola statyczna zostaje **domyślnym zestawem**, override modyfikuje wyjątkowo. Zachowuje fail-closed z resztą projektu (Constraint 14) zamiast zastępować mapę. **Nie cofa Rozstrzygnięcia #4** — modyfikuje je: statyczna mapa pozostaje bazą.

**Koszt architektoniczny (jawnie, bo to odejście od decyzji z startu projektu):** sprawdzenie uprawnienia przestaje być czystą funkcją na stringu roli. Efektywny zbiór jest rozstrzygany **raz**, przy ustalaniu kontekstu organizacji (ta sama transakcja, która i tak czyta membership), i niesiony dalej — nie jest to zapytanie per pojedyncze sprawdzenie uprawnienia. Dzięki temu **publiczna sygnatura chokepointu RBAC się nie zmienia**, a fazy zależne od niego nie wymagają przepisania. Pełny opis kosztu i blast radius: `docs/plan-implementacji.md`, Faza 23 (⚠️).

**Kontrola:** nadanie/odebranie override wymaga uprawnienia `member_permissions.manage` (§2.10, wyłącznie Owner/Admin) **oraz podania powodu** (pole `reason`, zapis bez niego odrzucany — ten sam wzorzec co `credits.manual_grant` i `client_price_override`) i jest logowane w audit trail. Zasięg overlay (tylko rola `reception` czy wszystkie role) jest otwartym punktem (§8).

### 2.37 Stawka godzinowa trenera (rozszerzenie §2.30, v17)

Sprostowanie względem Rozstrzygnięcia #18: „stawka godzinowa" w ActiveNow to w praktyce **stawka za zajęcia przeliczana przez faktyczny czas trwania sesji**, nie ryczałt niezależny od długości. `trainer_rate` (§1.2) dostaje kolumnę `rate_type` (`flat_per_session`\|`hourly`):
- `flat_per_session` — dotychczasowe zachowanie (ryczałt za poprowadzoną sesję, niezależny od liczby uczestników i długości; Rozstrzygnięcie #18);
- `hourly` — `amount` interpretowane jako **stawka za godzinę**, przeliczane przez `(session.end_time - session.start_time)` przy generowaniu raportu (§2.30, EPIK 32).

**Zakres (Rozstrzygnięcie #28):** `rate_type` jest **per `trainer_rate`**, nie per trener globalnie — bo `amount` już jest per `(trainer_id, group_type_id)` (Constraint 8), więc różne typy dla różnych typów grup tego samego trenera są dopuszczalne i spójne z istniejącą granularnością.

**Bez zmian:** nieretroaktywność (`effective_from`, nowy rekord przy zmianie), reguła rozstrzygania stawki (Constraint 8), kwalifikacja sesji do raportu (§2.30) oraz charakter „wyłącznie informacyjny" (żadnego payrollu, żadnej operacji na którymkolwiek z dwóch kont Stripe — Zasada nadrzędna #7). `rate_type` zmienia wyłącznie **przeliczenie kwoty**.

### 2.38 Import masowy przy onboardingu (v17)

Nowa akademia migruje istniejącą bazę rodziców i dzieci — dziś jedyną drogą jest ręczne wpisywanie. Generyczna funkcja **importu masowego CSV** (niezależna od konkretnego formatu konkurencji) usuwa ten koszt.

**Rdzeń: import `client`+`athlete`** (rodzic + dzieci) w jednym pliku, z deduplikacją po `(organization_id, email)` — spójnie z istniejącą unikalnością `client` (rewizja 14.1): wiersz z e-mailem już istniejącego rodzica dopisuje dziecko do jego profilu zamiast tworzyć duplikat. Import location/trenerów pozostaje **mniejszym, opcjonalnym add-onem** (§8) — rdzeniem jest client+athlete, bo to największy koszt ręcznej migracji.

**Weryfikacja (Rozstrzygnięcie #29):** importowani klienci dostają `is_verified=false` i przechodzą **wymuszony OTP przy pierwszym logowaniu**. Konsekwencja dla §2.8: zmigrowany klient **nie jest rozpoznawany bez weryfikacji** — dopóki nie przejdzie OTP, nie ma skróconej ścieżki zapisu ani prefillu. Uzasadnienie: admin ręczy za dane migracji, ale błędny e-mail w pliku nie może dać konta „zweryfikowanego bez faktycznej weryfikacji".

**Walidacja (Rozstrzygnięcie #29):** **wierszowa, nie atomowa** — plik częściowo poprawny importuje poprawne wiersze i zwraca raport błędów per wiersz (ten sam wzorzec raportu zbiorczego/częściowego sukcesu co Mass Move Bookings §2.11 i auto-fill §7.5a). Atomowość całego pliku uniemożliwiałaby migrację przy jednym błędnym wierszu.

**Import nigdy nie fabrykuje zgód** (§1.3, Zasada): pokrywa płaskie pola profilu (kontakt awaryjny, uwagi zdrowotne — §2.35), ale **nie tworzy** rekordów `athlete_consent`/`policy_acceptance`, bo zmigrowana zgoda bez `ip`/wersji nie ma waloru prawnego — zgody zbierane są ponownie w aplikacji. Uprawnienie: `data.import` (§2.10, Owner/Admin).

### 2.39 Zapis wielu uczestników w jednym przejściu (rozszerzenie §2.7, v17)

Dziś formularz publiczny (EPIK 4, US-4.1) tworzy jedno `athlete` na jedno przejście przez zapis. Rodzic z dwójką dzieci na te same zajęcia przechodzi cały przepływ (w tym OTP) dwa razy. Formularz pozwala dodać **N uczestników w jednym przejściu** (jeden OTP, jedna weryfikacja `client`).

**Zakres (Rozstrzygnięcie #30) — ta sama oferta:** wszystkie dzieci zapisywane są na **tę samą ofertę/sesję** w jednym przejściu. Wariant „różne oferty per dziecko" (koszyk N pozycji z osobną polityką/ceną/regulaminem per pozycja) jest świadomie poza zakresem — znacznie złożniejszy, nieuzasadniony na tym etapie.

**Osobna próba per dziecko, częściowy sukces (Constraint 15):** rezerwacja każdego dziecka przechodzi **osobną transakcję zajęcia miejsca** (§5.2) i **niezależnie** pełną ochronę §5 — jedno dziecko może dostać miejsce, drugie nie, jeśli sesja zapełni się w międzyczasie. Próby są **sekwencyjne** (prostsze i spójne z tym, jak §7.5a obsługuje auto-wypełnienie pakietu), a wynikiem jest raport częściowego sukcesu z jasnym komunikatem, którego dziecka nie udało się zapisać (wzorzec §7.5a / US-9.1/AC3–4). Niepowodzenie jednego dziecka nigdy nie wycofuje sukcesu rodzeństwa.

### 2.40 Moduł obozów: karta kwalifikacyjna uczestnika wypoczynku (v18)

Akademia korzystająca z langlion prowadzi często nie tylko zajęcia regularne, ale też **kolonie/półkolonie (wypoczynek)**. Organizator wypoczynku ma **prawny obowiązek** (rozporządzenie MEN) prowadzenia **karty kwalifikacyjnej uczestnika wypoczynku** — dziś, przy braku wsparcia w systemie, robi to poza nim. `qualification_card` (§1.2) domyka tę lukę.

**Dlaczego to NIE `policy_document`/`policy_acceptance` (§2.18):** regulamin to jednorazowa akceptacja gotowego dokumentu. Karta jest **ustrukturyzowanym formularzem wypełnianym w dwóch fazach w czasie**:
- **część rodzica — PRZED wypoczynkiem:** dane uczestnika i opiekunów (reużywają `athlete`/`client`), informacje o stanie zdrowia (choroby przewlekłe, przyjmowane leki z dawkowaniem, alergie, ograniczenia dietetyczne, informacja o szczepieniach), kontakt do rodzica na czas trwania wypoczynku; zgody (np. na wizerunek) reużywają wersjonowane `athlete_consent`/`consent_document` (§2.35), nie są duplikowane w karcie;
- **część kierownika wypoczynku — PO zakończeniu:** informacja o stanie zdrowia uczestnika w trakcie, ewentualne zdarzenia, „podpis"/data. Wypełnia ją personel z uprawnieniem `qualification_card.complete_return` (§2.10) — świadomie **osobnym** od `bookings.mark_attendance`, bo to inna rola (kierownik wypoczynku) i inne dane.

**Zakres pól — ustrukturyzowany podzbiór (Rozstrzygnięcie #32):** karta startuje z rozsądnym, rozszerzalnym podzbiorem pól (kolumny na `qualification_card`), nie z pełnym, dosłownym odwzorowaniem oficjalnego wzoru MEN. Pełna zgodność z wzorem wymaga **potwierdzenia prawnego** i pozostaje otwartym punktem (§8, #18) — analogicznie do już odnotowanego wymogu potwierdzenia prawnego przy re-akceptacji regulaminu (US-28.3/AC2).

**Dane wrażliwe (RODO):** pola zdrowotne karty są szczególną kategorią danych osobowych. Ich widoczność jest bramkowana istniejącym uprawnieniem `athlete_health.view` (§2.10, z EPIK 37) — **ten sam mechanizm** co dla `athlete.health_notes` (§2.35), nie drugi, równoległy mechanizm ograniczonej widoczności. Ostateczny zasięg widoczności i ewentualne szyfrowanie w spoczynku dziedziczą po otwartym punkcie §8 (#13, rozszerzony przez #21 o rolę kierownika wypoczynku).

**Sygnalizacja oferty obozowej:** `group_type.requires_qualification_card=true` (§1.2). Czy sygnalizacja ma być tą flagą, czy szerszym polem `category`, jest otwartym punktem (§8, #17).

**Eksport/wydruk:** karta jest zwykle wymagana fizycznie na miejscu obozu, więc potrzebny jest eksport/wydruk. Czy generowany PDF (przez adapter storage boilerplate §21, jak `policy_document.file_id`) czy widok do wydruku po stronie przeglądarki — otwarty punkt (§8, #20).

**Blokada zapisu vs wymóg przed startem:** czy wypełnienie karty **blokuje finalizację zapisu** na obóz (jak akceptacja regulaminu, §2.18), czy jest **wymagane dopiero przed rozpoczęciem wypoczynku** z osobnym przypomnieniem — otwarty punkt (§8, #19).

Jedna karta per uczestnik per obóz (Constraint 16). UI listy kart i eksportu pozostaje wąskie na tym etapie — ta sekcja dostarcza model i dwufazowy cykl, na których panel się oprze.

### 2.41 Opłaty dodatkowe ad-hoc (extra_fee) (v18)

Dotychczas każda płatność w systemie sprowadza się do konsumpcji `credit` (Zasada nadrzędna #2). To dobrze modeluje rezerwacje, ale nie **jednorazowe opłaty niezwiązane z żadną sesją ani pakietem** — strój, materiały, wpisowe, dopłata do wycieczki. Obejście przez `product_template` z `credit_quantity=1` sztucznie naciąga model kredytowy na coś, co kredytem nie jest. `extra_fee` (§1.2) obsługuje to wprost.

**Poza systemem kredytowym, nie wyjątek od Zasady #2 (Rozstrzygnięcie #35):** `extra_fee` nie generuje ani nie konsumuje `credit` i nie pojawia się w portfelu klienta (§7.12). Zasada nadrzędna #2 dotyczy **rezerwacji**; `extra_fee` rezerwacją z definicji nie jest, więc leży **poza zakresem** tej zasady — to nie jest wyłom w spójnym śladzie kredytowym, tylko byt innej natury.

**Płatność:** `payment_method` `online`\|`cash`. Online idzie tym samym torem co pozostałe płatności jednorazowe — **ad-hoc `price_data` na Connected Account** organizacji (Zasada nadrzędna #7), prościej niż przy rabatach subskrypcyjnych (Rozstrzygnięcie #20), bo brak subskrypcji oznacza brak problemu proracji. Cash potwierdza personel (jak `on_site_payment`, §2.6). Bramka Constraint 7 (v14) obowiązuje: online wymaga `stripe_connect_status=active`; cash zawsze dostępny.

**Pojedynczo i zbiorczo (Rozstrzygnięcie #34):** opłatę można nałożyć **pojedynczo** (z profilu klienta/uczestnika) albo **zbiorczo** — tę samą kwotę na wszystkich uczestników wskazanej sesji/grupy naraz (np. wszyscy uczestnicy wycieczki płacą tę samą kwotę). Zbiorcze idzie wzorcem operacji masowych §2.11 (Mass Move Bookings): osobny zapis per uczestnik w osobnej transakcji, raport zbiorczy (Constraint 17). W odróżnieniu od Mass Move Bookings **nie ma tu capacity ani kolizji do sprawdzenia**, więc niepowodzenie pojedynczego zapisu może wynikać tylko z błędu technicznego.

**Brak mechanizmu zwrotu (Rozstrzygnięcie #33):** system **nie** oferuje żadnego zwrotu `extra_fee` — ani prostego, ani pełnego mechanizmu fiducjarnego (EPIK 18). Jedyną korektą jest **usunięcie/anulowanie wpisu** (`status=cancelled` albo soft delete) — czysto administracyjna korekta rekordu, bez integracji ze Stripe Refund API i bez statusów `refunded`/`pending_refund`. Formuła proporcjonalna z §2.9 nie ma tu zastosowania (brak pojęcia „niewykorzystanych kredytów"). Faktyczny zwrot pieniędzy, jeśli akademia się na niego zdecyduje, odbywa się **poza systemem** — analogicznie do ręcznego fakturowania (§2.17).

**Fakturowanie (Rozstrzygnięcie #36):** `extra_fee` uczestniczy w tym samym **ręcznym** procesie fakturowania (§2.17) co `credit_purchase` — pola `invoice_requested_at`/`invoice_issued_at`/`invoice_number`/`invoice_issued_by_user_id`. Uzasadnienie: to realna sprzedaż mogąca wymagać faktury VAT; osobna, niefakturowalna ścieżka fragmentowałaby §2.17.

Tworzenie/anulowanie wymaga uprawnienia `extra_fees.manage` (§2.10) i jest logowane w audit trail. Czy `extra_fee` jest widoczne w panelu klienta pozostaje otwartym punktem (§8, #22).

### 2.42 Tematy lekcji i śledzenie prac domowych (v18)

E-dziennik (§2.33, EPIK 35) dostarczył **oceny** i **wolne notatki o postępach**. Osobno od nich potrzebny jest strukturalny zapis **„co było na dzisiejszej lekcji" (temat)** i **„co zadano do zrobienia" (praca domowa z możliwością odznaczenia wykonania)** — odpowiednik sekcji „Szczegóły lekcji" u konkurencji (ActiveNow), osobnej od ich sekcji „Oceny"/„Notatki". To rozszerzenie **tej samej listy uczestników sesji** (§16.1), nie nowy, równoległy mechanizm — dzieli nośnik UI i wzorzec uprawnień z e-dziennikiem.

**Temat lekcji (`lesson_topic`):** dotyczy **całej sesji**, nie pojedynczego uczestnika. Jeden wpis (tytuł + treść) per sesja opisujący, co zrealizowano.

**Praca domowa (`homework`):** zadana **całej grupie** w kontekście sesji (opis + termin). Czy zadanie może istnieć **bez** `session_id` (np. praca na wakacje) jest otwartym punktem (§8, #23) — kolumna `session_id` jest nullable, co zostawia obie ścieżki bez retrofitu.

**Wykonanie (`homework_completion`):** status wykonania jest już **per uczestnik**, oznaczany **przez personel** z listy uczestników sesji (Rozstrzygnięcie #31) — kierunek zapisu ten sam co `attendance_status` (§2.29). Rodzic w tej wersji **wyłącznie widzi** status, nie oznacza go sam; pole `completed_by_actor_type` (zawsze `staff` teraz) jest rezerwowe pod przyszłe samoobsługowe odznaczanie, dodane od razu, by uniknąć retrofitu schematu.

**Niezależność osi (Constraint 18):** oś wykonania pracy domowej jest całkowicie rozłączna od `booking.payment_status` i `booking.attendance_status` — ten sam wzorzec „osobna oś" co e-dziennik (Constraint 12) i obecność (§2.29). Zmiana statusu wykonania nie pociąga zmiany obecności/płatności i odwrotnie.

**Uprawnienia:** wpis tematu, zadanie pracy domowej i odznaczanie wykonania wymagają uprawnienia `lesson_log.manage` (§2.10) — krąg ról i ograniczenie trenera do **własnych** sesji (backend-enforced) ten sam co `grades.enter` (§2.33) i `bookings.mark_attendance` (§2.29). Każdy wpis/nadpisanie logowane w audit trail.

**Powiadomienie i widoczność u klienta:** nowy temat/zadanie generuje powiadomienie klienta (`homework_assigned`/`lesson_topic_added`, §2.16, `is_overridable=tak`) — **e-mailem od razu** przed wdrożeniem Notification Center (e-mail-first, wzorzec Rozstrzygnięcia #24 dla ocen; retrofit in-app razem z EPIK 26). Klient widzi temat, zadanie i status wykonania dziecka w panelu klienta (retrofit razem z panelem klienta). Czy powiadomienia lekcji to jedno zdarzenie „nowy wpis lekcji" czy dwa osobne pozostaje otwartym punktem (§8, #24).

---

### 2.43 Hasło klienta jako alternatywna metoda logowania (v19)

Dotychczasowy model logowania klienta opiera się wyłącznie na domenowym OTP (§2.8, §2.19, Faza 3). Ryzyko, które to rozszerzenie adresuje: sesja klienta żyje 30 dni z odświeżaniem (D37) i jest wyłącznie cookie z opaque tokenem — kradzież cookie/urządzenia daje długotrwały dostęp bez drugiego czynnika. Hasło jest dodawane jako **opcjonalna, alternatywna** metoda logowania, nie jako wymóg — zgodnie z twardym wymogiem biznesowym, że formularz zapisowy pozostaje narzędziem sprzedażowym bez friction.

Model składa się z trzech elementów:

**1. Formularz zapisowy (`/zapisy/...`) — bez zmian.** OTP działa dokładnie jak dziś (US-4.1–4.6), w tym pomijanie OTP dla rozpoznanego, zweryfikowanego klienta (US-4.2, D75). Hasło nigdzie w tym przepływie nie jest wymagane ani proponowane — żadnego nowego kroku.

**2. Ekran propozycji hasła PO zakończonej rezerwacji.** Nowa, w pełni opcjonalna, pomijalna jednym kliknięciem sekcja „ustaw hasło" na ekranie potwierdzenia rezerwacji. Kluczowe zastrzeżenie: ta propozycja **nie jest warunkowana przez `payment_status`** — pojawia się niezależnie od tego, czy `booking.payment_status` to już `confirmed`, czy dopiero `payment_pending`/`booked_offline`. Ustawienie hasła jest decyzją o koncie klienta, całkowicie niezależną od stanu rezerwacji — ten sam wzorzec niezależnych osi, który dokument już stosuje dla `attendance_status` względem `payment_status` (§2.29) i dla e-dziennika (Constraint 12). Ekran pojawia się także dla klienta rozpoznanego, który pominął krok OTP (US-4.2) — jego tożsamość jest już potwierdzona przez wcześniejszą, żywą sesję, więc ustawienie hasła jest tak samo bezpieczne jak dla klienta, który właśnie przeszedł OTP. Przy zapisie wielu dzieci w jednym przejściu (§2.39, EPIK 40, Faza 22 jeśli już wdrożona) ekran pojawia się **jednokrotnie, na końcu całego batcha** sekwencyjnych prób, niezależnie od tego, ile z nich się powiodło — dotyczy konta klienta, nie pojedynczej rezerwacji.

**3. Osobna strona logowania panelu klienta — hasło jako ścieżka główna, OTP wyłącznie jako wymuszony reset.**

- Klient **bez** ustawionego hasła widzi na stronie logowania panelu wyłącznie „zaloguj przez kod" — bez regresji względem dzisiejszego zachowania.
- Klient **z** ustawionym hasłem widzi pole hasła jako ścieżkę główną logowania.
- Link „nie pamiętam hasła" uruchamia OTP, ale **kończy się wymuszonym ustawieniem NOWEGO hasła**, nigdy cichym wejściem do panelu z pominięciem hasła. Stare hasło przestaje działać, a wszystkie sesje klienta są unieważniane w tej samej transakcji (Constraint 19). Prawdziwy właściciel konta dostaje o tym powiadomienie („Twoje hasło zostało zmienione") jako zdarzenie `client_password_changed` w Notification Center z `is_overridable=false` (§2.16) — ten sam wzorzec niewyłączalności co zdarzenia finansowe/bezpieczeństwa (`refund_confirmed`, `payment_failed`).

**Dlaczego OTP jest resetem, nie równoległym fallbackiem — i dlaczego to nie wolno „uprościć" z powrotem.** Gdyby OTP był zawsze widoczny obok hasła jako alternatywna, równie łatwa ścieżka logowania, ustawienie hasła nie dawałoby żadnej realnej dodatkowej ochrony: atakujący z dostępem do maila/telefonu ofiary po prostu pomijałby hasło i logował się kodem, dokładnie tak jak dziś. Cały sens tego rozszerzenia — zabezpieczenie przed ryzykiem długiej sesji przy kradzieży samego urządzenia/cookie — wymaga, żeby hasło było **jedynym** sposobem ominięcia kodu, nie jednym z dwóch równoważnych. Stąd zasada: OTP na stronie logowania panelu **zawsze** kończy się wymuszeniem nowego hasła, nigdy zwykłym zalogowaniem. Ten sam wzorzec ostrzeżenia, jaki dokument stosuje dla `trainer_availability` („nigdy źródło prawdy o zajętości", §2.32) i dla override overlay (§2.36) — zapisany explicite, żeby przyszła zmiana nie potraktowała przywrócenia równoległego fallbacku jako niewinnego uproszczenia UX.

**Rewokacja sesji przy resecie (Constraint 19).** Sesje klienta (`client_session`) są rekordami w bazie, nie samowystarczalnymi podpisanymi tokenami (D37) — rewokacja jest więc natychmiastowa i musi być bezwarunkowa. Reset hasła (przez wymuszony OTP) oraz jakakolwiek inna zmiana hasła MUSI unieważniać (usuwać) wszystkie istniejące `client_session` tego klienta w tej samej transakcji, w której hash hasła jest aktualizowany.

**Rate limiting.** Próby logowania hasłem reużywają istniejący adapter rate-limit (`features/client-auth/rate-limit.ts`, dziś skonfigurowany pod wydawanie/weryfikację OTP), z osobnym bucketem/progiem dobranym pod hasło. Inaczej niż przy sześciocyfrowym OTP (D41 — cap na wierszu obok rate limitu, bo pod spodem nie ma nic), fail-open adaptera przy awarii store'u jest tu akceptowalny sam w sobie — pod hasłem stoi hash odporny na brute-force (argon2 lub odpowiednik boilerplate'u), więc brak dodatkowego capu na wierszu nie jest luką.

**Uprawnienie personelu do wymuszenia resetu.** Świadomie **poza zakresem** tego rozszerzenia — patrz §8 #25.

