### 1.2 Encje — pełna specyfikacja pól (część 4: funkcje v17–v18 — zainteresowanie, zgody, uprawnienia, obozy, opłaty, e-dziennik lekcji)

#### interest_signup (v17)

Lekki zapis zainteresowania ofertą, dla której harmonogram jeszcze nie istnieje (`group_type.status = collecting_interest`, §2.34, EPIK 36). Nie zajmuje miejsca, nie konsumuje kredytu, nie pobiera płatności — jest **leadem**, nie rezerwacją. Świadomie osobna, wąska encja zamiast rozluźniania wymagalności pól `group_type_recurrence` (Rozstrzygnięcie #25) — dzięki temu żaden constraint §5 ani ścieżka generowania sesji (§2.2) nie wymaga retrofitu.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| group_type_id | FK → `group_type` | oferta, którą klient jest zainteresowany |
| client_id | FK → `client` | rodzic zgłaszający |
| athlete_id | FK → `athlete` | dziecko, którego dotyczy zgłoszenie |
| created_at | timestamp | |
| converted_booking_id | FK → `booking`, nullable | ustawiane, gdy admin ręcznie przeniósł zgłoszenie do realnej rezerwacji (§2.34); domyka ślad konwersji |
| converted_at | timestamp, nullable | moment konwersji |

Brak `session_id`, `price`, `credit`. Unikalność `(group_type_id, athlete_id)` — jedno dziecko = jedno zgłoszenie per oferta (Constraint 13).

#### consent_document (v17)

Repozytorium wersjonowanych dokumentów zgód (np. „Zgoda na wykorzystanie wizerunku"). Ten sam wzorzec wersjonowania i nieretroaktywności co `policy_document` (§2.18, §2.35, EPIK 37).

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK | izolacja tenant |
| name | string | np. „Zgoda na wizerunek" |
| file_id | FK → storage (boilerplate §21), nullable | opcjonalny plik PDF treści zgody |
| body | text, nullable | treść zgody, gdy nie jest plikiem |
| version | int | inkrementowany przy każdej zmianie treści; edycja tworzy nowy rekord/wersję, nigdy nie nadpisuje istniejącej |
| is_required_at_signup | boolean | czy akceptacja jest obowiązkowym krokiem formularza zapisu; czy blokuje twardo, czy tylko odnotowuje odmowę — otwarty punkt (§8) |
| is_active / deleted_at | soft delete | |

#### athlete_consent (v17)

Zdarzenie akceptacji/odmowy zgody, osobny byt (nie pole na `athlete`), bo to zdarzenie prawne niezależne od cyklu życia profilu — wzorzec `policy_acceptance` (§2.18).

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK | izolacja tenant |
| client_id | FK → `client` | rodzic składający zgodę |
| athlete_id | FK → `athlete` | którego dziecka dotyczy zgoda |
| consent_document_id | FK → `consent_document` | |
| consent_document_version | int | dokładna zaakceptowana wersja, **zamrożona** w momencie akceptacji (Zasada nieretroaktywności zgód, §1.3) |
| granted | boolean | zgoda może być odmowna — `false` odnotowuje świadomą odmowę, `true` akceptację |
| accepted_at | timestamp | |
| ip_address | string, opcjonalne | dowód akceptacji. **Import masowy nigdy nie fabrykuje tego rekordu** — zmigrowana zgoda bez `ip`/wersji nie ma waloru prawnego (§2.38, Rozstrzygnięcie #29) |

#### membership_permission_override (v17)

Wyjątek grant/revoke pojedynczego uprawnienia dla konkretnego membership personelu, **nakładany NA statyczną rolę bazową** (§2.36, EPIK 38). Świadomie NIE mechanizm ról custom w DB (boilerplate §4.3) — Rozstrzygnięcie #27 zachowuje statyczną mapę ról jako bazę i tylko ją modyfikuje wyjątkowo. Rozstrzyganie efektywnego zbioru: Constraint 14.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| membership_id | FK → Membership (boilerplate, §2.19) | którego członka personelu dotyczy wyjątek |
| permission_key | string | uprawnienie z katalogu domenowego (§2.10); override na nieistniejący klucz jest ignorowany (Constraint 14) |
| effect | enum | `grant` (dodaje uprawnienie ponad rolę) \| `revoke` (odbiera uprawnienie, które rola bazowa daje) |
| granted_by_user_id | FK → User | kto nadał wyjątek |
| reason | text, **wymagane** | uzasadnienie; zapis bez powodu odrzucany — ten sam wzorzec co `credits.manual_grant` (§US-7.3) i `client_price_override` (§2.31) |
| created_at | timestamp | |

Unikalność `(membership_id, permission_key)` — jeden wyjątek per para. Zasięg (tylko rola `reception` czy wszystkie role) jest otwartym punktem (§8).

#### qualification_card (v18)

Karta kwalifikacyjna uczestnika wypoczynku — **wymóg prawny** (rozporządzenie MEN) dla organizatorów kolonii/półkolonii. Świadomie NIE jest to `policy_document`/`policy_acceptance` (jednorazowa akceptacja gotowego dokumentu, §2.18): to **ustrukturyzowany formularz wypełniany dwufazowo w czasie** — część rodzica przed wypoczynkiem, część kierownika po jego zakończeniu. Pełny opis: §2.40, EPIK 41, Constraint 16.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| athlete_id | FK → `athlete` | uczestnik wypoczynku |
| group_type_id | FK → `group_type` | oferta obozowa, której dotyczy karta (`requires_qualification_card=true`). Wiązanie z ofertą, nie z pojedynczą sesją — spójnie z `interest_signup` |
| status | enum | `parent_pending` \| `parent_completed` \| `leader_completed` — dwie fazy wypełniania (§2.40) |
| **część rodzica (przed wypoczynkiem):** | | |
| chronic_conditions | text, nullable | choroby przewlekłe. **Dane wrażliwe (RODO)** — widoczność części zdrowotnej przez bramkę `athlete_health.view` (§2.10), spójnie z `athlete.health_notes` (§2.35), nie drugi równoległy mechanizm |
| medications | text, nullable | przyjmowane leki z dawkowaniem. **Dane wrażliwe** |
| allergies | text, nullable | alergie. **Dane wrażliwe** |
| dietary_restrictions | text, nullable | ograniczenia dietetyczne |
| vaccinations_info | text, nullable | informacja o szczepieniach. **Dane wrażliwe** |
| parent_contact_during_camp | string, nullable | kontakt do rodzica na czas trwania wypoczynku |
| **część kierownika (po zakończeniu):** | | |
| health_during_camp | text, nullable | informacja o stanie zdrowia uczestnika w trakcie wypoczynku. **Dane wrażliwe** |
| incidents | text, nullable | ewentualne zdarzenia w trakcie wypoczynku |
| leader_signed_at | timestamp, nullable | data „podpisu" kierownika wypoczynku (zamknięcie części po powrocie) |
| completed_by_user_id | FK → User, nullable | kto (personel, §2.19) wypełnił część kierownika; wymaga uprawnienia `qualification_card.complete_return` (§2.10), świadomie osobnego od `bookings.mark_attendance` |
| file_id | FK → storage (boilerplate §21), nullable | wyeksportowany PDF karty (do fizycznego okazania na miejscu obozu). PDF vs wydruk przeglądarkowy jest otwartym punktem (§8, #20) |
| created_at | timestamp | |

Dane opiekunów/uczestnika w części tożsamościowej reużywają `athlete` i `client` (nie duplikują). Zgoda na wizerunek NIE żyje na karcie — to wersjonowane `athlete_consent`/`consent_document` (§2.35), reużyte. Zakres pól jest **ustrukturyzowanym podzbiorem** wzoru MEN (Rozstrzygnięcie #32); pełna zgodność z oficjalnym wzorem wymaga potwierdzenia prawnego (§8, #18). Unikalność `(group_type_id, athlete_id)` — jedna karta per uczestnik per obóz (Constraint 16).

#### extra_fee (v18)

Jednorazowa opłata dodatkowa niezwiązana z żadną sesją ani pakietem (strój, materiały, wpisowe, wycieczka). **Świadomie POZA systemem kredytowym** — nie generuje ani nie konsumuje `credit`. To nie jest wyjątek od Zasady nadrzędnej #2 („każda rezerwacja sprowadza się do konsumpcji `credit`"), tylko byt **poza jej zakresem**: Zasada #2 dotyczy rezerwacji, a `extra_fee` rezerwacją z definicji nie jest (Rozstrzygnięcie #35). Pełny opis: §2.41, EPIK 42.

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| client_id | FK → `client` | klient obciążany opłatą |
| athlete_id | FK → `athlete`, nullable | uczestnik, którego dotyczy opłata (opcjonalne — opłata może dotyczyć rodzica, nie konkretnego dziecka) |
| booking_id | FK → `booking`, nullable | opcjonalne powiązanie z konkretną rezerwacją |
| group_type_id | FK → `group_type`, nullable | opcjonalne powiązanie z ofertą |
| session_id | FK → `class_session`, nullable | opcjonalny kontekst sesji przy nałożeniu **zbiorczym** (§2.41, Constraint 17) |
| amount | integer (najmniejsza jednostka waluty, §2.14) | kwota opłaty w `organization.currency` |
| currency_snapshot | jsonb/string | zamrożona waluta z momentu utworzenia (jak `booking.price_snapshot` — §2.14), na wypadek przyszłej zmiany `organization.currency` |
| description | string | opis opłaty (np. „Strój treningowy", „Wpisowe") |
| status | enum | `pending` \| `paid` \| `cancelled`. **Brak** statusów `refunded`/`pending_refund` z premedytacją (Rozstrzygnięcie #33 — brak mechanizmu zwrotu) |
| payment_method | enum | `online` \| `cash` |
| stripe_payment_intent_id | string, nullable | tylko `online`; utworzony na **Connected Account** organizacji (`organization.stripe_connect_account_id`), nigdy na koncie platformy — Zasada nadrzędna #7 |
| invoice_requested_at / invoice_issued_at / invoice_number / invoice_issued_by_user_id | jak `credit_purchase` | `extra_fee` uczestniczy w tym samym **ręcznym** procesie fakturowania (§2.17) co `credit_purchase` — Rozstrzygnięcie #36 |
| created_by_user_id | FK → User | kto (personel, §2.19) utworzył opłatę; wymaga `extra_fees.manage` (§2.10) |
| created_at | timestamp | |
| is_active / deleted_at | soft delete | anulowanie/usunięcie wpisu (`status=cancelled` albo soft delete) jest jedyną korektą — **żadnej integracji ze Stripe Refund** (Rozstrzygnięcie #33). Faktyczny zwrot pieniędzy, jeśli akademia się na niego zdecyduje, odbywa się poza systemem (analogicznie do ręcznego fakturowania §2.17) |

#### lesson_topic (v18)

Temat lekcji — strukturalne „co było na dzisiejszych zajęciach", dotyczące **całej sesji**, nie pojedynczego uczestnika. Osobne od ocen/notatek e-dziennika (EPIK 35) — ta sama lista uczestników sesji (§16.1) jako nośnik, sekcja „Szczegóły lekcji". Pełny opis: §2.42, EPIK 43.

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| session_id | FK → `class_session` | sesja, której dotyczy temat |
| title | string | tytuł tematu |
| body | text | treść tematu (co zrealizowano) |
| created_by_user_id | FK → User | autor (personel, §2.19); wymaga `lesson_log.manage` (§2.10), trener tylko własne sesje |
| created_at | timestamp | |

#### homework (v18)

Praca domowa zadana **całej grupie** w kontekście sesji. Wykonanie jest już per uczestnik (`homework_completion`).

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| session_id | FK → `class_session`, **nullable** | sesja, na której zadano pracę. Nullable, bo czy dopuścić zadanie bez sesji (np. praca na wakacje) jest otwartym punktem (§8, #23) — kolumna nullable zostawia obie ścieżki bez retrofitu |
| description | text | opis zadania |
| due_date | date, nullable | termin wykonania |
| created_by_user_id | FK → User | autor (personel, §2.19); `lesson_log.manage`, trener tylko własne sesje |
| created_at | timestamp | |

#### homework_completion (v18)

Status wykonania pracy domowej przez konkretnego uczestnika — **oś całkowicie niezależna** od `attendance_status` i `payment_status` (Constraint 18), tym samym wzorcem co niezależność obecności od płatności (§2.29).

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| homework_id | FK → `homework` | której pracy dotyczy |
| athlete_id | FK → `athlete` | którego uczestnika dotyczy |
| status | enum, default `not_done` | `not_done` \| `done` |
| marked_by_user_id | FK → User | kto oznaczył (personel, §2.19). W tej wersji oznacza **wyłącznie personel** (Rozstrzygnięcie #31); `lesson_log.manage`, trener tylko własne sesje |
| marked_at | timestamp, nullable | moment ostatniego oznaczenia; wcześniejsze wartości odtwarzalne z audit trail |
| completed_by_actor_type | enum, default `staff` (v18) | `staff` \| `client` — **w tej wersji zawsze `staff`**. Pole **rezerwowe** pod przyszłe samoobsługowe oznaczanie przez rodzica: Rozstrzygnięcie #31 ogranicza kierunek zapisu wyłącznie do personelu teraz, ale dodanie kolumny od razu unika retrofitu schematu, gdyby decyzja zmieniła się kiedyś na „oba kierunki" |

Unikalność `(homework_id, athlete_id)` — jeden status wykonania per uczestnik per zadanie (Constraint 18).

Powiązane: 01b-rdzen-organizacje-sesje-rezerwacje.md, 01f-relacje-integralnosc.md
