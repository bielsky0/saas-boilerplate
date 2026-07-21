### 1.2 Encje — pełna specyfikacja pól (część 2: kredyty, płatności, stawki trenerów, e-dziennik)

#### credit_type

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| name | | |
| group_type_id | FK, 1:1 | izolacja: kredyty typu A nie działają w grupach typu B |
| is_active / deleted_at | soft delete | |

#### credit

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| client_id | FK (rodzic) | |
| credit_type_id | FK | |
| athlete_id | FK, nullable | NULL = kredyt rodzinny (dowolne dziecko), ustawione = zarezerwowany dla 1 dziecka |
| valid_until | date | koniec miesiąca kalendarzowego w `organization.timezone` |
| status | enum | `available` \| `used` \| `expired` \| `refunded` \| `pending_refund` |
| source | enum | `cancellation` \| `manual_admin_grant` \| `on_site_payment` \| `subscription_purchase` \| `admin_session_cancellation` \| `online_payment` |
| source_booking_id | FK, warunkowe | gdy `source=cancellation`/`admin_session_cancellation` |
| granted_by_user_id, reason | warunkowe | gdy `source=manual_admin_grant` |
| credit_purchase_id | FK, warunkowe | gdy `source=subscription_purchase` |
| used_in_booking_id | FK, nullable | |

#### product_template

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| name, credit_type_id, credit_quantity | | |
| price | integer (najmniejsza jednostka waluty) | |
| validity_days | int | |
| billing_type | enum | `one_time` \| `recurring` — MUSI mieścić się w `allowed_billing_types` typu grupy powiązanego przez `credit_type_id → credit_type.group_type_id` (walidacja na backendzie przy każdym zapisie) ORAZ w `plan_feature_flag.subscriptions_enabled` organizacji, gdy `billing_type=recurring` (v13, §2.21) |
| stripe_price_id | string, nullable | ID ceny na **Connected Account** organizacji (`organization.stripe_connect_account_id`), nie na koncie platformy — patrz Zasada nadrzędna #7 (v14). Tworzenie/edycja `product_template` z `payment_method` online jest zablokowana, dopóki `stripe_connect_status != active` (§2.25) |
| is_active / deleted_at | soft delete | |

#### credit_purchase

| Pole | Typ | Opis |
|---|---|---|
| id, client_id, product_template_id | | |
| payment_method | enum | `online` \| `cash` |
| target_recurrence_id | FK, nullable | wymagane dla auto-wypełnienia w Schedule-First (§7.5a) |
| price_paid | integer (najmniejsza jednostka waluty) | baza formuły zwrotu |
| stripe_payment_intent_id / stripe_subscription_id | warunkowe, tylko online | utworzone na **Connected Account** organizacji (`organization.stripe_connect_account_id`), nigdy na koncie platformy — patrz Zasada nadrzędna #7 (v14) |
| purchased_at | timestamp | |
| refunded_at, refund_amount | nullable; `refund_amount` integer | |
| refund_confirmed_by_user_id | FK, nullable | wypełniane wyłącznie dla `payment_method=cash`; admin potwierdzający fizyczny zwrot gotówki jest źródłem prawdy zamiast webhooka |
| refund_initiated_at | timestamp, nullable | moment kliknięcia „zatwierdź zwrot" przez admina |
| subscription_status | enum, nullable | `active` \| `past_due` \| `canceled` \| `unpaid` — aktualizowane webhookiem. Wyłącznie informacyjne/raportowe |
| invoice_requested_at | timestamp, nullable | moment zgłoszenia przez klienta chęci otrzymania faktury |
| invoice_issued_at | timestamp, nullable | moment ręcznego oznaczenia „faktura wystawiona" |
| invoice_number | string, nullable | numer faktury wpisany ręcznie, wyłącznie referencyjnie |
| invoice_issued_by_user_id | FK, nullable | kto oznaczył fakturę jako wystawioną |

#### client_price_override (v15)

Indywidualna cena wynegocjowana z konkretnym klientem (rodzicem). Przyznawana **wyłącznie ręcznie przez admina**, z profilu tego klienta — nigdy z poziomu `group_type`, nigdy samoobsługowo. Pełny opis przepływu: §2.31, EPIK 33.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| client_id | FK → `client` | klient (rodzic), którego dotyczy rabat |
| group_type_id | FK, nullable | ustawione = rabat wyłącznie na tę ofertę; `NULL` = wszystkie oferty akademii. Rozstrzyganie pierwszeństwa: Constraint 9, §1.3 |
| override_type | enum | `percent_discount` \| `fixed_price` |
| value | integer | interpretowane wg `override_type`: procent rabatu (`percent_discount`) albo kwota docelowa w najmniejszej jednostce waluty (`fixed_price`, §2.14) |
| valid_from | date | |
| valid_until | date, nullable | `NULL` = bezterminowo. Wygasa samoczynnie — pierwszy zakup/odnowienie po tej dacie nalicza cenę katalogową, bez żadnej akcji admina i **bez powiadomienia klienta** (§2.31) |
| reason | text, **wymagane** | uzasadnienie biznesowe; zapis bez powodu jest odrzucany — ten sam wzorzec co `credits.manual_grant` (§US-7.3) |
| granted_by_user_id | FK → User | kto przyznał rabat |
| is_active | boolean | wyłączenie działa identycznie jak `valid_until` w przeszłości — od następnego zakupu, nigdy wstecz |

#### trainer_rate (v15)

Stawka wynagrodzenia trenera — **wyłącznie informacyjna**. Nie tworzy żadnej płatności, wypłaty ani rekordu na którymkolwiek z dwóch kont Stripe (Zasada nadrzędna #7). Pełny opis: §2.30, EPIK 32.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| trainer_id | FK → User (personel, §2.19) | |
| group_type_id | FK, nullable | `NULL` = stawka bazowa trenera; ustawione = nadpisanie dla tego typu grupy. Rozstrzyganie pierwszeństwa: Constraint 8, §1.3 |
| amount | integer (najmniejsza jednostka waluty, §2.14) | interpretacja zależy od `rate_type` (v17): dla `flat_per_session` — **ryczałt za poprowadzoną sesję**, niezależny od liczby uczestników i długości zajęć (Rozstrzygnięcie #18); dla `hourly` — **stawka za godzinę**, przeliczana przez czas trwania sesji przy raporcie (§2.37) |
| rate_type | enum, default `flat_per_session` (v17) | `flat_per_session` \| `hourly`. Steruje wyłącznie **przeliczeniem kwoty** w raporcie (§2.37); wersjonowanie (`effective_from`) i rozstrzyganie stawki (Constraint 8) bez zmian. Pole per `trainer_rate` — różne typy dla różnych `group_type` tego samego trenera są dopuszczalne (Rozstrzygnięcie #28) |
| effective_from | date | data wejścia stawki w życie. Zmiana stawki tworzy **nowy rekord**, nigdy nie nadpisuje istniejącego — ten sam wzorzec nieretroaktywności co `policy_document.version` (§2.18), dzięki czemu raport za miniony okres nie zmienia się po podwyżce |

#### trainer_availability (v16)

Cotygodniowe okno dyspozycyjności trenera — **wyłącznie warstwa podpowiedzi/prezentacji slotów** dla silników Availability-First i Slot-First. Nie tworzy sesji, nie blokuje żadnego zapisu i **nigdy nie jest źródłem prawdy o zajętości** — tą pozostaje wyłącznie constraint §5.1 (Constraint 1). Pełny opis: §2.32, EPIK 34, Constraint 11.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| trainer_id | FK → User (personel, §2.19) | |
| day_of_week | int/enum | dzień tygodnia — interpretowany w `organization.timezone`, jak `group_type_recurrence` |
| start_time, end_time | time | początek/koniec okna dostępności w `organization.timezone` |
| location_id | FK `location`, nullable | `NULL` = dostępność niezależna od lokalizacji; ustawione = okno w konkretnej lokalizacji. Semantyka „różna dostępność per lokalizacja tego samego dnia" jest otwartym punktem — patrz §8 |
| is_active | boolean | wyłączenie usuwa okno z podpowiedzi od następnego liczenia slotów, nigdy wstecz |

Brak jakiegokolwiek `trainer_availability` dla trenera nie blokuje sprzedaży (spójnie z fail-open Constraint 9), ale też nie oznacza „wolny 24/7": domyślną górną/dolną granicą slotów są godziny pracy (umiejscowienie kolumny — `location` vs `organization` — otwarte, §8). Dostępność, jeśli zdefiniowana, dodatkowo zawęża tę granicę (Constraint 11).

#### grade_field (v16)

Definicja konfigurowalnego pola oceny e-dziennika. Pole żyje jako **szablon na typie grupy** (`group_type_id`) dziedziczony przez wszystkie sesje tego typu, **albo** jako wpis **ad-hoc dla jednej sesji** (`session_id`), nigdy oba naraz. Pełny opis: §2.33, EPIK 35, Constraint 12.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| group_type_id | FK `group_type`, nullable | szablon pola dziedziczony przez sesje tego typu |
| session_id | FK `class_session`, nullable | pole ad-hoc dla jednej sesji (np. „Kartkówka"), niezależne od szablonu typu |
| name | string | nazwa pola prezentowana na liście uczestników i w panelu klienta |
| field_type | enum | `numeric` \| `text` \| `scale` — wstępny, minimalny katalog typów; pełny zakres i UX konfiguracji → §8 |
| is_active / deleted_at | soft delete | |
| created_by_user_id | FK → User | kto zdefiniował pole |

**Zasada (egzekwowana CHECK constraintem XOR w bazie, nie tylko opisem): dokładnie jedno z `group_type_id`/`session_id` jest ustawione, nigdy oba naraz i nigdy żadne** — ten sam wzorzec twardej integralności co `organization_id`/`account_id` na encjach fundamentu (wzorzec „owner XOR"). Rozstrzyganie zbioru pól sesji: Constraint 12.

#### grade (v16)

Wartość oceny wpisana konkretnemu uczestnikowi w ramach danego `grade_field`.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| grade_field_id | FK `grade_field` | które pole oceny |
| athlete_id | FK `athlete` | którego uczestnika dotyczy |
| value | string/jsonb | interpretowane wg `grade_field.field_type` |
| comment | text, nullable | komentarz prowadzącego (np. „Kartkówka — dobra forma") |
| graded_by_user_id | FK → User | kto wpisał/ostatnio zmienił ocenę (personel, §2.19) |
| graded_at | timestamp | moment ostatniego wpisu/edycji; wcześniejsze wartości odtwarzalne z audit trail (jak `attendance_status`) |

#### progress_note (v16)

Notatka o postępach przypisana do uczestnika — wolny tekst (pochwała/uwaga/obserwacja), **niepowiązany z konkretną oceną**.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| athlete_id | FK `athlete` | którego uczestnika dotyczy |
| session_id | FK `class_session`, nullable | opcjonalny kontekst sesji, w której notatka powstała |
| title | string | tytuł notatki |
| body | text | treść notatki |
| author_user_id | FK → User | autor (personel, §2.19) |
| created_at | timestamp | |

#### group_change_request

Dedykowany byt dla wniosku o Zmianę Grupy (§7.6, §EPIK 11). Węższy niż uniwersalny `client_request` — obsługuje wyłącznie ten jeden przepływ; nie łączy go z przeniesieniem kredytu między dziećmi (§7.1a), które na MVP pozostaje osobną, prostszą ścieżką zatwierdzenia (patrz §6 „Odłożone poza MVP").

| Pole | Typ | Opis |
|---|---|---|
| id, organization_id | | |
| client_id | FK | inicjator wniosku |
| source_booking_id | FK | obecna rezerwacja, z której klient rezygnuje |
| target_session_id | FK | docelowa sesja |
| status | enum | `submitted → admin_approved \| admin_rejected → awaiting_payment → completed \| expired \| cancelled_by_admin \| cancelled_by_client` |
| price_difference | integer (najmniejsza jednostka waluty), nullable | wyliczana i zamrażana przy przejściu do `admin_approved`; dodatnia = dopłata, ujemna = zwrot, zero = brak płatności |
| resulting_booking_id | FK, nullable | nowa `booking` na `target_session_id`, tworzona przy `admin_approved` (jeśli `price_difference != 0`, status startowy `payment_pending`; jeśli = 0, od razu `confirmed`) |
| stripe_payment_intent_id | nullable | ustawiane, gdy `price_difference > 0` |
| expires_at | timestamp, nullable | ustawiane przy `admin_approved`, gdy `price_difference > 0` (§EPIK 11, US-11.3) |
| submitted_at | timestamp | |
| reviewed_by_user_id, reviewed_at, rejection_reason | nullable | audit decyzji admina |
| cancelled_by_user_id, cancellation_reason | nullable | audit anulowania po zatwierdzeniu |

Powiązane: 01b-rdzen-organizacje-sesje-rezerwacje.md, 01f-relacje-integralnosc.md
