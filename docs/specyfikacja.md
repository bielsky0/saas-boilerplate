# Specyfikacja funkcjonalna: Moduł Grup i Rezerwacji

**Wersja dokumentu: 15** — integracja Dodatku v15: **potwierdzanie obecności (EPIK 31), informacyjne wynagrodzenia trenerów (EPIK 32) oraz indywidualne ceny klienta — `client_price_override` (EPIK 33)**, plus opis oferty `group_type.description` na publicznej stronie rejestracji (§US-2.1/AC4). Budowana na Wersji 14 (**Stripe Connect i konfiguracja płatności per organizacja — EPIK 30**), Wersji 13 (limity planu i feature gating — EPIK 29), Wersji 12 (waluta i kwoty pieniężne — EPIK 24, obsługa nieudanej płatności subskrypcyjnej — EPIK 25, Notification Center jako dedykowana encja domenowa — EPIK 26, ręczne fakturowanie bez automatyzacji Stripe Tax — EPIK 27, regulaminy i akceptacje per typ grupy — EPIK 28), oraz jawna integracja z fundamentem Next.js SaaS Boilerplate.

**Zakres świadomie NIE objęty v15** (potwierdzone jako niepotrzebne na tym etapie): tematy zajęć i kategorie sukcesu, link do spotkania online per sesja, automatyczna integracja z Fakturownia/KSeF (fakturowanie pozostaje ręczne bez zmian — §2.17, EPIK 27), panel klienta z historią płatności oraz raporty i analityka frekwencji/rentowności. Dwa ostatnie punkty to wyłącznie brak UI — dane już istnieją w modelu, a EPIK 31 dostarcza surowe dane frekwencyjne, na których taki raport w przyszłości się oprze.

**Rewizja 14.2 (2026-07-19):** adresowanie dwupoziomowe — `organization.subdomain` (unikalny globalnie, wymóg DNS) dla witryny akademii oraz `group_type.slug` (unikalny per organizacja) dla pojedynczej oferty; patrz §1.2 (`organization`) i §2.27. Dodatkowo §2.28: encja `session` nosi w implementacji nazwę `class_session` z powodu kolizji z tabelą sesji logowania fundamentu.

**Rewizja 14.1 (2026-07-19):** tożsamość klienta (rodzica) jako odrębna encja domenowa `client` — czwarty świadomy wyjątek od reguły reużycia boilerplate'u. Klient NIE korzysta z boilerplate'owego User/Membership; unikalność e-maila per `(organization_id, email)`, logowanie przez domenowy OTP scoped per organizacja. Patrz §1.2 (`client`), §2.8, §2.19. Odwołania „boilerplate §X" wskazują na `docs/boilerplate-spec.md`.

**Format:** Model danych → Opis funkcjonalności → User Stories i Acceptance Criteria (wszystkie ścieżki)
**Odbiorcy:** zespół deweloperski / Claude Code, QA, product owner

---

## 0. Kontekst i zasada nadrzędna

Moduł zarządzania grupami zajęciowymi dla wielodzierżawnego (multi-tenant) SaaS akademii pozaszkolnych, budowany na fundamencie Next.js SaaS Boilerplate. Każda akademia (organization) działa niezależnie, może działać w jednej lub kilku fizycznych lokalizacjach, w jednej strefie czasowej i jednej walucie rozliczeniowej.

**Zasada nadrzędna #1 — Definicja oddzielona od Realizacji:** Definicja (`group_type`, `group_type_recurrence`) — szablon: nazwa, silnik, cena, polityka płatności, lokalizacja domyślna, dozwolone tryby zakupu/rozliczenia, przypisany regulamin. Edycja Definicji nigdy nie propaguje się wstecz do już wygenerowanych Realizacji ani do już rozpoczętych procesów zakupowych (w tym trwających subskrypcji i już złożonych akceptacji regulaminu). Realizacja (`session`) — konkretne wydarzenie w kalendarzu, żyje własnym życiem po wygenerowaniu.

**Zasada nadrzędna #2 — Kredyt jako jedyna waluta rozliczeniowa:** Każda rezerwacja, niezależnie od silnika i metody płatności (online, gotówka, subskrypcja, korekta admina, odwołanie), sprowadza się do tego samego zdarzenia: konsumpcji jednostki `credit`. Jeden spójny ślad audytowy zamiast równoległych mechanizmów.

**Zasada nadrzędna #3 — Ochrona współbieżności na poziomie bazy, nie aplikacji:** Wszystkie miejsca podatne na race conditions (podwójna rezerwacja trenera, przekroczenie pojemności, kolizja sportowca) są zabezpieczone constraintami/blokadami bazodanowymi, nie logiką „sprawdź-potem-zapisz" w aplikacji.

**Zasada nadrzędna #4 — Blokada zamiast wymuszonego kreatora:** Żadna operacja usunięcia/dezaktywacji encji, od której zależą aktywne dane (przyszłe sesje, aktywne wzorce, rezerwacje), nie jest wykonywana automatycznie ani nie wymusza wieloetapowego kreatora w locie. Zamiast tego system blokuje operację i pokazuje komunikat (toast) z listą konkretnych, zależnych elementów, które trzeba najpierw rozwiązać innymi, już istniejącymi narzędziami (substytucja, masowa zmiana trenera, ręczne odwołanie sesji). To dotyczy zarówno offboardingu trenera, jak i dezaktywacji `group_type`, jak i dezaktywacji lokalizacji, jak i **downgrade'u planu ponad nowe limity (§EPIK 29)** — jeden spójny wzorzec zamiast wielu różnych.

**Zasada nadrzędna #5 — Fundament boilerplate'owy, nie duplikacja:** Wszędzie, gdzie Next.js SaaS Boilerplate dostarcza gotowy, ogólny mechanizm (autentykacja, RBAC, billing/Stripe adapter, storage, audit trail), moduł langlion go wykorzystuje, nie buduje równoległego odpowiednika — z dwoma jawnymi wyjątkami: Notification Center jest dedykowaną encją domenową langlion (patrz §2.16), ponieważ odbiorcy i katalog zdarzeń są specyficzne dla domeny rezerwacji, nie dla generycznego kontekstu B2B boilerplate'u; oraz definicje planów/limitów/funkcji, które żyją w bazie danych zamiast w konfiguracji aplikacji sugerowanej przez boilerplate §5.2 (patrz §EPIK 29), ponieważ mają bezpośredni wpływ na przychód i muszą się zmieniać bez deploya.

**Zasada nadrzędna #6 — Limity i featury jako dane, nie kod:** Definicje planów, limitów liczbowych i dostępnych funkcji żyją w bazie danych i są edytowalne przez uprawniony personel (Super Admin) z poziomu panelu, bez udziału deweloperów i bez deploya. Kod aplikacji odpytuje te dane w czasie rzeczywistym; nigdzie w kodzie nie ma zahardkodowanego progu liczbowego przypisanego do konkretnego planu. Ten sam wzorzec „słownika edytowalnego bez deploya", jaki dokument stosuje dla `notification_event_type` (§2.16).

**Zasada nadrzędna #7 — Dwa niezależne konta Stripe, nigdy nie mylone (v14):** System operuje na dwóch odrębnych relacjach ze Stripe, które nigdy nie współdzielą tożsamości ani środków: (1) **Platform Billing** — własne konto Stripe platformy langlion, którym rozliczana jest organizacja za korzystanie z SaaS (opłata za plan, §EPIK 29); (2) **Connected Account** — własne konto Stripe każdej akademii, połączone przez Stripe Connect, na które trafiają wpłaty rodziców za zajęcia/pakiety (`credit_purchase`, `product_template`). Środki z Connected Account nigdy nie przepływają przez konto platformy ani nie mieszają się z opłatą za plan. Każda operacja tworząca PaymentIntent/Subscription po stronie klienta akademii musi jawnie wskazywać docelowe Connected Account; pomyłka między tymi dwoma kontekstami jest traktowana jako błąd krytyczny, nie kosmetyczny.

---

## 1. Model danych

### 1.1 Diagram relacji (opis tekstowy)

```
organization (1) ──< location (N)
                │
                ├──< plan (przez organization.plan_id, N:1) ──< plan_limit_definition (N)
                │                                            └─< plan_feature_flag (N)
                ├──< organization_limit_override (N) (v13)
                ├── stripe_connect_account_id / stripe_connect_status (v14, Connected Account — płatności klientów akademii)
                │   (odrębne od platform_stripe_customer_id — Platform Billing za plan, §EPIK 29, patrz Zasada nadrzędna #7)
                │
organization (1) ──< group_type (N) ──< group_type_recurrence (N) ──< session (N) ──< booking (N) >── athlete (1)
                │                              │        │                    │             │            │
                │                              │        └── location_id ──> location       │            │
                │                              │        (nadpisuje group_type.default_location_id)      │
                │                              └── target_recurrence_id ── credit_purchase   │     parent_client_id
                │                              └── default_location_id ──> location          │
                │                              └── allowed_purchase_modes / allowed_billing_types
                │                              └── policy_document_id ──> policy_document     │
                │                              └── description (v15, markdown na stronie oferty)
                │                                                                             │
                │                          attendance_status / attendance_marked_at / _by_user_id (v15)
                │                          (oś niezależna od payment_status — patrz §2.29)
                │
                ├──< client (N, is_verified) ──< athlete (N)
                │         │
                │         ├──< credit (N) >── credit_type (1) ── group_type (1:1)
                │         │         │
                │         │         └── source_booking_id / used_in_booking_id / credit_purchase_id
                │         │
                │         ├──< policy_acceptance (N) ── group_type_id / policy_document_id
                │         │
                │         ├──< client_price_override (N, v15) ── group_type_id (nullable)
                │         │         (rabat per klient; §2.31, EPIK 33)
                │         │
                │         └──< notification (N, recipient_type=client)
                │
                ├──< trainer_rate (N, v15) ── trainer_id / group_type_id (nullable)
                │         (stawka informacyjna; §2.30, EPIK 32)
                │
                ├──< credit_type (N) ── group_type_id (1:1)
                ├──< product_template (N) ── credit_type_id
                │          │  (billing_type musi mieścić się w group_type.allowed_billing_types
                │          │   ORAZ w plan_feature_flag organizacji — patrz §2.21, v13)
                │          └──< credit_purchase (N) ── target_recurrence_id (nullable) ── payment_method: online|cash
                │                     └── subscription_status / invoice_requested_at / invoice_issued_at
                │
                ├──< policy_document (N)
                ├──< notification_event_type (N, katalog/słownik)
                └──< notification (N) >── notification_preference (N)
```

`session.location_id` kopiowana przy generowaniu z `group_type_recurrence.location_id` (lub `group_type.default_location_id`, jeśli wzorzec nie nadpisuje); edytowalna per-sesja, chroniona flagą `is_manually_adjusted` na równi z `start_time`/`end_time`.

`organization.plan_id` (v13) rozstrzyga efektywne limity/featury organizacji łącznie z ewentualnym `organization_limit_override` — patrz §1.3 i §2.20.

`organization.stripe_connect_account_id`/`stripe_connect_status` (v14) rozstrzygają, czy akademia może przyjmować płatności online od swoich klientów — patrz §1.3, §2.24–§2.26. To pole jest niezależne od billingu platformy (opłaty organizacji za plan, §EPIK 29) — patrz Zasada nadrzędna #7.

`booking.attendance_status` (v15) jest osią całkowicie niezależną od `booking.payment_status` — patrz §2.29. `trainer_rate` (v15) i `client_price_override` (v15) są encjami organizacji, rozstrzyganymi regułami pierwszeństwa z §1.3 (Constraint 8 i 9); żadna z nich nie wpływa na silnik rezerwacji ani na ochronę współbieżności z §5.

### 1.2 Encje — pełna specyfikacja pól

#### organization

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| name | string | |
| slug | string, unikalny globalnie | identyfikator panelu personelu: `/orgs/{slug}`. Odrębny od `subdomain` poniżej — patrz §2.27 |
| subdomain | string, unikalny **globalnie** (rewizja 14.2) | etykieta DNS publicznej witryny akademii: `{subdomain}.langlion.com`. Wymóg globalnej unikalności pochodzi od DNS, nie od nas. Pole wymagane, **bez wartości domyślnej** i **nigdy nieautogenerowane z `name`** (kolizje nazw akademii są realne) — ta sama zasada co `currency`. Walidacja: etykieta DNS wg RFC 1035, 3–63 znaki, plus lista nazw zarezerwowanych (`www`, `api`, `admin`, `cdn`…). Patrz §2.27 |
| timezone | string (IANA) | np. `Europe/Warsaw` — jedna akademia = jedna strefa czasowa, niezależnie od liczby lokalizacji fizycznych |
| currency | string (ISO 4217) | np. PLN, EUR — jedna akademia = jedna waluta. Multi-currency w ramach jednej organizacji świadomie poza zakresem. Pole wymagane, bez wartości domyślnej |
| plan_id | FK → `plan`, wymagane (v13) | plan przypisany organizacji; każda organizacja ma zawsze jakiś plan, w tym darmowy/trial jako wartość domyślna przy tworzeniu organizacji |
| platform_stripe_customer_id | string, nullable (v14) | ID klienta na koncie Stripe **platformy** — służy wyłącznie do billingu za plan (§EPIK 29). Nigdy nie mylić z `stripe_connect_account_id` poniżej — patrz Zasada nadrzędna #7 |
| stripe_connect_account_id | string, nullable (v14) | ID Connected Account (`acct_...`) na Stripe Connect — własne konto Stripe akademii, na które trafiają wpłaty jej klientów za zajęcia/pakiety |
| stripe_connect_status | enum (v14) | `not_connected` \| `onboarding_incomplete` \| `active` \| `restricted` \| `disabled` — zdenormalizowany stan, aktualizowany webhookiem `account.updated` |
| stripe_connect_charges_enabled | boolean, default false (v14) | odzwierciedla `charges_enabled` ze Stripe; musi być `true`, aby akademia mogła przyjmować płatności online (§2.25) |
| stripe_connect_payouts_enabled | boolean, default false (v14) | odzwierciedla `payouts_enabled` ze Stripe; informacyjne — brak wypłat nie blokuje przyjmowania płatności, ale jest sygnalizowany adminowi |
| stripe_connect_connected_at | timestamp, nullable (v14) | moment pomyślnego zakończenia onboardingu Connect (pierwsze `charges_enabled=true`) |

#### location

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| name | string | np. „Hala Sportowa Centrum", „Basen Miejski ul. Kwiatowa" |
| address | string, opcjonalne | |
| is_active / deleted_at | soft delete | |

#### group_type (Definicja)

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant |
| name | string | |
| slug | string, unikalny | URL rejestracji, np. `/zapisy/obozy-2026` |
| description | text/markdown, nullable (v15) | opis oferty prezentowany klientowi na publicznej stronie rejestracji (`{organization.subdomain}.langlion.com/zapisy/{slug}`, §2.27). Czysto prezentacyjny — nie wpływa na żadną logikę rezerwacji, cenową ani na walidację zapisu. Pole opcjonalne: brak opisu = sekcja nie jest renderowana |
| engine | enum | `schedule_first` \| `availability_first` \| `slot_first` |
| payment_policy | enum/set | dozwolone metody: online / na miejscu / oba — METODA płatności, niezależna od trybu zakupu poniżej |
| price | integer (najmniejsza jednostka waluty, np. grosze) | cena pojedynczych zajęć w walucie `organization.currency`; baza dla `booking.price_snapshot`, `credit.source=online_payment/on_site_payment` |
| is_new_client_only | boolean | patrz US w epiku Rejestracja |
| eligible_trainer_ids | list FK | pusta = wszyscy aktywni trenerzy |
| default_location_id | FK `location`, nullable | domyślna lokalizacja dla wszystkich wzorców/sesji tego typu, o ile nie nadpisana na poziomie wzorca |
| allowed_purchase_modes | set enum, wymagane min. 1 wartość | `single_class` (zakup pojedynczych zajęć) \| `package` (wyłącznie/dodatkowo pakiet) |
| allowed_billing_types | set enum, wymagane gdy `package` w `allowed_purchase_modes` | `one_time` \| `recurring` — dopuszczalne typy rozliczenia pakietów dla tego typu grupy |
| policy_document_id | FK `policy_document`, nullable | wskazuje aktualnie obowiązujący regulamin tego typu grupy; brak wartości = krok akceptacji regulaminu pomijany przy zapisie |
| is_active / deleted_at | soft delete | |

#### group_type_recurrence

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| group_type_id | FK | |
| day_of_week, start_time, duration | | interpretowane w `organization.timezone` |
| trainer_id | FK | |
| capacity | int | |
| location_id | FK `location`, nullable | nadpisuje `group_type.default_location_id` dla tego konkretnego wzorca, gdy ustawione |
| is_recurring | boolean | |
| occurrences_count | int, wymagane jeśli `is_recurring` | |
| start_date | date | |

#### session (Realizacja)

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| group_type_id, trainer_id | FK | |
| start_time, end_time | timestamptz (UTC) | generowane w lokalnej strefie akademii, konwertowane do UTC |
| capacity | int | kopiowana przy generowaniu; edytowalna per-sesja |
| location_id | FK `location`, wymagane | kopiowana przy generowaniu z `group_type_recurrence.location_id` (lub `group_type.default_location_id`); edytowalna per-sesja, tym samym wzorcem co `capacity` |
| status | enum | `scheduled` \| `cancelled` |
| generated_from_recurrence_id | FK, nullable | śledzenie pochodzenia bez wymuszania synchronizacji wstecznej |
| organization_id | FK (zdenormalizowane) | ustawiane automatycznie, nigdy ręcznie |
| is_manually_adjusted | boolean, default false | ustawiane na `true`, gdy admin ręcznie zmienia `start_time`/`end_time` LUB `location_id` tej konkretnej sesji (nie przez edycję wzorca). Masowa aktualizacja z poziomu wzorca (§3.4) pomija sesje z tą flagą. Force Override (§3.1) nie ustawia tej flagi |

#### client (rewizja 14.1)

Odrębna, w pełni domenowa encja tożsamości klienta akademii (rodzica) — świadomie NIE reużywa boilerplate'owego User/Membership (czwarty wyjątek od Zasady nadrzędnej #5, patrz §2.19).

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK, wymagane | izolacja tenant — klient istnieje wyłącznie w kontekście jednej akademii |
| email | string | unikalność `(organization_id, email)`, NIE globalna — ten sam adres w dwóch akademiach to dwa niezależne, niepowiązane rekordy |
| phone | string, opcjonalne | |
| name | string, opcjonalne | |
| is_verified | boolean, default false | `false` = rekord utworzony przez upsert przed weryfikacją OTP; `true` po poprawnej weryfikacji OTP |

Personel akademii (Owner/Admin/Recepcja/Trener) pozostaje bez zmian na boilerplate'owym User + Membership (§2.19). Logowanie klienta: domenowy OTP scoped do `(organization_id, email)` — kod wydany w Akademii A jest bezużyteczny w Akademii B, nawet dla identycznego adresu e-mail.

#### athlete

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| parent_client_id | FK → `client` | |
| name, age | | `age` opcjonalny |

#### booking

| Pole | Typ | Opis |
|---|---|---|
| id, session_id, athlete_id | | |
| payment_status | enum | `payment_pending` \| `booked_offline` \| `confirmed` \| `cancelled` \| `no_show` |
| price_snapshot | jsonb | zamrożona cena/polityka z momentu rezerwacji. Musi zawierać walutę obowiązującą w momencie rezerwacji (`organization.currency` w tamtym momencie), nie tylko kwotę |
| consumed_credit_id | FK, nullable | |
| session_start_time, session_end_time | timestamptz (zdenormalizowane) | wymagane przez constraint z §5.3 |
| organization_id | FK (zdenormalizowane) | |
| attendance_status | enum, default `unmarked` (v15) | `unmarked` \| `present` \| `absent` — potwierdzenie faktycznej obecności na zajęciach. **Oś całkowicie niezależna od `payment_status`** (§2.29): oznaczenie obecności nigdy nie zmienia statusu płatności, a `payment_status=no_show` (§US-16.2) pozostaje bez zmian i nie jest z tym polem synchronizowany w żadną stronę. `unmarked` (nieoznaczone) jest odróżnialne od `absent` (oznaczone jako nieobecny) |
| attendance_marked_at | timestamp, nullable (v15) | moment ostatniego oznaczenia obecności |
| attendance_marked_by_user_id | FK → User, nullable (v15) | kto ostatnio oznaczył obecność (personel — boilerplate User, §2.19); wcześniejsze wartości odtwarzalne z audit trail |

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
| amount | integer (najmniejsza jednostka waluty, §2.14) | **ryczałt za poprowadzoną sesję** — niezależny od liczby uczestników i od długości zajęć (Rozstrzygnięcie #18) |
| effective_from | date | data wejścia stawki w życie. Zmiana stawki tworzy **nowy rekord**, nigdy nie nadpisuje istniejącego — ten sam wzorzec nieretroaktywności co `policy_document.version` (§2.18), dzięki czemu raport za miniony okres nie zmienia się po podwyżce |

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

#### policy_document

Repozytorium wersjonowanych dokumentów regulaminowych.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK | izolacja tenant |
| name | string | np. „Regulamin zajęć — Technika 1" |
| file_id | FK → storage (boilerplate §21) | plik PDF regulaminu |
| version | int | inkrementowany przy każdej zmianie treści; edycja treści tworzy nowy rekord/wersję, nigdy nie nadpisuje istniejącej |
| is_active / deleted_at | soft delete | |

#### policy_acceptance

Zdarzenie akceptacji, osobny byt (nie pole na `booking`, bo to zdarzenie prawne niezależne od cyklu życia rezerwacji).

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| client_id | FK (rodzic) | |
| group_type_id | FK | |
| policy_document_id, policy_document_version | FK/int | dokładna zaakceptowana wersja, zamrożona w momencie akceptacji |
| accepted_at | timestamp | |
| ip_address | string, opcjonalne | dowód akceptacji |

#### notification_event_type

Tabela słownikowa katalogu zdarzeń — edytowalna/rozszerzalna bez deploya.

| Pole | Typ | Opis |
|---|---|---|
| code | PK, string | np. `group_change_approved`, `credit_expiring_soon`, `refund_confirmed`, `location_changed`, `payment_failed`, `partial_autofill`, `plan_limit_approaching`, `plan_limit_reached` (v13) |
| default_channels | set enum (`in_app`, `email`) | domyślne kanały dla nowego odbiorcy, jeśli nie ustawił własnych preferencji |
| is_overridable | boolean | czy odbiorca może wyłączyć ten typ zdarzenia całkowicie. `false` dla zdarzeń finansowych/bezpieczeństwa (nieudana płatność, zwrot potwierdzony, wygasający kredyt) |

#### notification

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK | izolacja tenant |
| recipient_type | enum | `client` \| `staff` — rozróżnienie, czy odbiorcą jest klient akademii (encja `client`, rewizja 14.1) czy personel (boilerplate User/Membership) |
| recipient_id | FK (polimorficzne wg `recipient_type`) | |
| event_type | FK → `notification_event_type.code` | |
| content | text/jsonb | wygenerowana treść (po podstawieniu zmiennych, np. nazwa sesji, kwota) |
| link | string, nullable | cel po kliknięciu (np. link do rezerwacji, do Stripe Customer Portal) |
| status | enum | `unread` \| `read` |
| channel_sent | set enum | które kanały faktycznie zostały użyte przy tym zdarzeniu (może się różnić od preferencji, jeśli kanał był `is_overridable=false`) |
| created_at | timestamp | |

#### notification_preference

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| recipient_type, recipient_id | | jak wyżej |
| event_type | FK | |
| in_app_enabled, email_enabled | boolean | ignorowane (zawsze `true`) jeśli `notification_event_type.is_overridable = false` |

#### plan (v13)

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| code | string, unikalny | slug planu, np. `basic`, `pro`, `unlimited`, `trial` |
| name | string | nazwa wyświetlana klientowi |
| stripe_price_id | string, nullable | powiązanie z produktem w Stripe (boilerplate §5.1); nullable dla planów niekomercyjnych (trial, custom) |
| is_custom | boolean | plan wynegocjowany indywidualnie, nieprezentowany w publicznym cenniku |
| is_active | boolean | czy dostępny do nowego zakupu (dezaktywowany plan nadal obsługuje istniejących klientów — wzorzec identyczny do soft delete z §EPIK 20) |
| sort_order | int | kolejność w cenniku |

#### plan_limit_definition (v13)

Słownik limitów, edytowalny bez deploya — ten sam wzorzec co `notification_event_type`.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| plan_id | FK | |
| limit_key | string | np. `max_students`, `max_groups`, `max_trainers`, `max_locations`, `max_sessions_per_month` — patrz tabela kluczy w §2.20 |
| limit_value | int, nullable | `NULL` = brak limitu (unlimited), wartość jawna |

#### plan_feature_flag (v13)

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| plan_id | FK | |
| feature_key | string | np. `subscriptions_enabled`, `multi_location`, `policy_documents`, `invoice_tracking` |
| is_enabled | boolean | |

#### organization_limit_override (v13)

Indywidualne warunki dla pojedynczej organizacji bez tworzenia dla niej osobnego planu.

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| organization_id | FK | |
| limit_key | string | |
| limit_value | int, nullable | |

### 1.3 Kluczowe relacje i reguły integralności

- `session.organization_id`, `booking.organization_id`, `credit.organization_id` — zdenormalizowane kopie, ustawiane automatycznie (trigger/transakcja), nigdy edytowane ręcznie. Rekomendacja: Postgres Row-Level Security filtrujące po `organization_id`.
- `credit_type.group_type_id` (1:1) — kredyt jednego typu działa wyłącznie w grupach tego samego typu.
- `credit.athlete_id` nullable — model „portfela rodzinnego"; konsumpcja FIFO filtruje `athlete_id IS NULL OR athlete_id = booking.athlete_id`, priorytetyzując dopasowanie konkretne przed rodzinnym.
- **Constraint 1 (§5.1):** `EXCLUDE USING gist` na `(trainer_id, tstzrange(start_time, end_time))` w `session` — brak nakładających się sesji tego samego trenera.
- **Constraint 2 (§5.3):** `EXCLUDE USING gist` (wymaga `btree_gist`) na `(athlete_id, tstzrange(session_start_time, session_end_time)) WHERE payment_status NOT IN ('cancelled')` w `booking` — brak nakładających się aktywnych rezerwacji tego samego zawodnika.
- **Constraint 3 (§4.4):** unikalny `(group_type_recurrence_id, start_time)` w `session` — idempotencja generowania.
- **Blokada wiersza (§5.2):** `SELECT ... FOR UPDATE` na `session` w transakcji tworzącej `booking`, licząca aktywne rezerwacje względem `capacity`. Rozszerzenie (v8): ta sama blokada obowiązuje w transakcji aktualizującej `session.start_time`/`end_time`/`location_id` przy edycji wzorca (§3.4) — serializuje edycję względem równoległego tworzenia bookingu na tej samej sesji.
- `group_change_request.resulting_booking_id` — nowa `booking` zawsze nosi `price_snapshot` = pełna cena docelowej grupy, nigdy różnicę; kwota różnicy żyje wyłącznie jako `stripe_payment_intent_id` na `group_change_request`, niezależnie od `price_snapshot`.
- **Constraint 4 (v11):** przy zapisie `product_template`, backend odrzuca zapis, jeśli `billing_type` nie mieści się w `allowed_billing_types` typu grupy powiązanego przez `credit_type_id → credit_type.group_type_id`.
- **Constraint 5 (v12):** `organization.currency` jest wymagane i niezmienne po pierwszym zapisie danych transakcyjnych bez jawnej procedury migracji — zmiana waluty organizacji z istniejącymi `credit_purchase`/`booking` wymaga świadomej decyzji operacyjnej, nie jest zwykłą edycją pola.
- **Constraint 6 (v13):** `organization.plan_id` jest wymagane — organizacja bez przypisanego planu nie może zostać utworzona; nie istnieje stan „brak planu" w produkcyjnym przepływie.
- Zasada (v12): `credit_purchase.invoice_requested_at`/`invoice_issued_at` nigdy nie blokują ścieżki zakupowej ani generowania kredytów — to pola czysto administracyjne, niezależne od stanu `payment_status`/`credit`.
- **Rozstrzyganie efektywnego limitu/feature'u organizacji (v13):** `organization_limit_override` dla danego `(organization_id, limit_key)`, jeśli istnieje → `plan_limit_definition` przypisana do `organization.plan_id` → brak wpisu w obu = **fail-closed** (operacja blokowana). Ta sama kolejność pierwszeństwa dotyczy `plan_feature_flag` (bez odpowiednika override na poziomie funkcji boolowskich w MVP — patrz §8 otwarte punkty).
- **Constraint 7 (v14):** przyjmowanie płatności online od klientów akademii (`group_type.payment_policy` z opcją online, tworzenie `product_template` z płatnością online, generowanie Stripe Checkout dla `booking`/`credit_purchase`/`group_change_request`) wymaga `organization.stripe_connect_status = active` (czyli `stripe_connect_charges_enabled = true`). Sprawdzenie wykonywane na backendzie przy każdej próbie, nie tylko przy zapisie konfiguracji — spójnie z pozostałymi bramkami w dokumencie (RBAC §4.2, limity planu §2.20). Płatność na miejscu (`cash`) nigdy nie wymaga Stripe Connect i pozostaje dostępna niezależnie od statusu.
- **Constraint 8 (v15) — rozstrzyganie stawki trenera dla sesji:** `trainer_rate` dla pary `(trainer_id, group_type_id)` z największym `effective_from <= session.start_time`, jeśli istnieje → `trainer_rate` dla `(trainer_id, NULL)` z tą samą regułą → brak wiersza w obu = sesja **nie wchodzi do sumy** raportu i trafia na wyodrębnioną listę „brak stawki". Świadomie nie jest to zero: brak stawki to luka w konfiguracji, którą admin ma zobaczyć, nie cicha wartość neutralna (§2.30, US-32.3).
- **Constraint 9 (v15) — rozstrzyganie ceny dla klienta:** aktywny `client_price_override` (`is_active=true` ORAZ `valid_from <= now()` ORAZ `valid_until IS NULL OR valid_until >= now()`) dla pary `(client_id, group_type_id)`, jeśli istnieje → dla `(client_id, NULL)` → cena katalogowa (`group_type.price` albo `product_template.price`). Zachowanie jest **fail-open**: brak override oznacza zwykłą cenę, nigdy blokadę. To świadomie odwrotny domyślny wybór niż przy limitach planu i feature flagach (fail-closed, patrz wyżej) — nierozstrzygnięty rabat nigdy nie może zatrzymać sprzedaży, podczas gdy nierozstrzygnięty limit musi.
- **Zasada (v15) — zamrożenie ceny po rabacie:** `booking.price_snapshot` oraz `credit_purchase.price_paid` zapisują kwotę **po** zastosowaniu override, zgodnie z Zasadą nadrzędną #1 — późniejsza zmiana, wygaśnięcie lub wyłączenie rabatu nigdy ich nie rusza. **Jedyny wyjątek: subskrypcje** (`billing_type=recurring`), gdzie rabat jest stanem żywym sprawdzanym przy każdym odnowieniu, nie wartością zamrożoną przy pierwszym zakupie — patrz §2.31 i §2.15.
- **Zasada (v15) — niezależność obecności od płatności:** `booking.attendance_status` i `booking.payment_status` są dwiema rozłącznymi osiami. Żadna zmiana jednej nigdy nie pociąga za sobą zmiany drugiej, w obie strony — w szczególności `payment_status=no_show` (§US-16.2) nie ustawia `attendance_status='absent'`, a oznaczenie `absent` nie zmienia statusu płatności (§2.29).

---

## 2. Opis funkcjonalności — moduły

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

Każde zdarzenie dotyczące wielu odbiorców naraz (np. odwołanie sesji) tworzy osobny rekord `notification` per odbiorca, wysyłane w ramach jednej operacji — bez dodatkowej agregacji (Notification Batching pozostaje odłożone poza MVP, patrz §6).

### 2.17 Faktury i dokumenty sprzedaży — proces ręczny

Decyzja: brak automatycznego fakturowania (Stripe Tax/Invoicing) w MVP. Jeśli klient poprosi o fakturę VAT, zespół wystawia ją ręcznie, poza systemem. System langlion jedynie odnotowuje fakt żądania i wystawienia (`invoice_requested_at`, `invoice_issued_at`, `invoice_number`, `invoice_issued_by_user_id` na `credit_purchase`) — żeby był ślad audytowy.

Potwierdzenie płatności generowane automatycznie przez Stripe (paragon/receipt) pozostaje jedynym automatycznym dokumentem. Ten mechanizm nigdy nie blokuje standardowej ścieżki zakupowej — `invoice_requested_at`/`invoice_issued_at` są polami czysto administracyjnymi.

### 2.18 Regulaminy i akceptacje — dokumenty prawne per typ grupy

Administrator przypisuje regulamin (`policy_document`) do typu grupy przy jego tworzeniu. System zapamiętuje, którą dokładnie wersję zaakceptował każdy klient przy zapisie — zgodnie z tą samą zasadą nieretroaktywności, którą dokument już stosuje dla ceny i polityki (Zasada nadrzędna #1).

Edycja treści regulaminu (nowy plik) tworzy nowy rekord/wersję `policy_document`, nigdy nie nadpisuje istniejącej. Akceptacja klienta (`policy_acceptance`) zamraża `policy_document_version` w momencie akceptacji.

`group_type` bez przypisanego `policy_document_id` pomija krok akceptacji przy formularzu rejestracji — pole jest opcjonalne na poziomie typu grupy.

### 2.19 Integracja z SaaS Boilerplate — model tożsamości (rewizja 14.1)

Boilerplate'owe User/Membership/Organization (boilerplate sekcje 1, 3, 4) są modelem dla personelu akademii — Owner, Admin, Recepcja, Trener z RBAC opisanym w §2.10. Organization boilerplate'u = organization langlion (jedna akademia = jeden tenant).

Rodzice/klienci NIE korzystają z boilerplate'owego User/Membership **w żadnej formie** — to odrębna, w pełni domenowa encja `client` (§1.2). Uzasadnienie: pełna izolacja per organizacja jest twardym wymogiem biznesowym — Akademia A i Akademia B to odrębne, niepowiązane ekosystemy z perspektywy klienta; współdzielenie loginu między nimi jest niedopuszczalne, nawet jeśli dane pozostają technicznie odseparowane. To jest CZWARTY świadomy wyjątek od reguły „użyj tego, co jest w boilerplacie" (Zasada nadrzędna #5) — obok Notification Center (§2.16), modelu planów/limitów (v13) i Stripe Connect (v14).

Rekomendacja wdrożeniowa:
- Personel: boilerplate'owy User (konto, hasło, sesje — boilerplate §2) + Membership + role z §2.10 — bez żadnych modyfikacji fundamentu auth.
- Klienci: encja `client` z unikalnością `(organization_id, email)`; logowanie przez domenowy OTP/magic link scoped do `(organization_id, email)` — token jednorazowy, krótkotrwały, przechowywany wyłącznie jako hash (wzorzec identyczny jak tokeny zaproszeń boilerplate'u); kod wydany w Akademii A jest bezużyteczny w Akademii B nawet dla tego samego adresu e-mail. Sesja klienta jest osobnym mechanizmem od sesji personelu (Better Auth), scoped per organizacja.
- Relacja klienta do organizacji wynika wprost z `client.organization_id` (oraz powiązanych `athlete`/`booking`/`credit`) — klient nigdy nie otrzymuje Membership ani roli RBAC, nie ma dostępu do panelu admina.
- Role z §2.10 definiuje się jako zestaw uprawnień przypisywanych do Membership w scentralizowanej mapie RBAC boilerplate'u.
- Audit trail: langlion nie buduje własnego, drugiego audit loga — wykorzystuje wspólny hook z boilerplate §6.4, z typem wykonawcy `User` dla akcji personelu i osobnym typem dla akcji klienta.
- Storage (boilerplate §21) jest fundamentem pod `policy_document.file_id`.
- Billing (boilerplate §5, adapter Stripe) obsługuje **Platform Billing** — opłatę organizacji za plan langlion (§EPIK 29) — na koncie Stripe **platformy**, przez `organization.platform_stripe_customer_id`.
- System kredytowy (`credit_purchase`, `product_template`) oraz Zmiana Grupy (`group_change_request`) działają na osobnym, **Connected Account** akademii (§EPIK 30, v14), przez `organization.stripe_connect_account_id` — ten sam adapter Stripe boilerplate'u jest rozszerzony o obsługę Connect (Standard accounts, OAuth, webhook `account.updated`), ale operuje na całkowicie odrębnej tożsamości Stripe niż Platform Billing. Patrz Zasada nadrzędna #7.
- Notification Center (§2.16), **model planów/limitów (v13)**, **rozszerzenie adaptera billingowego o Stripe Connect (v14)** oraz **tożsamość klienta jako encja domenowa (rewizja 14.1)** są jedynymi świadomymi wyjątkami/rozszerzeniami reguły „użyj tego, co jest w boilerplacie" — patrz Zasada nadrzędna #5.

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

### 2.27 Adresowanie: subdomena akademii i slug oferty (rewizja 14.2)

System operuje **dwoma poziomami identyfikatorów** o różnym zasięgu unikalności. Rozróżnienie jest istotne, bo mylenie ich prowadzi albo do kolizji między akademiami, albo do niepotrzebnego wycieku informacji o cudzej ofercie.

| Poziom | Pole | Zasięg unikalności | Rola |
|---|---|---|---|
| 1 | `organization.subdomain` | **globalny** (wymóg DNS) | identyfikuje akademię: `akademia-a.langlion.com` |
| 2 | `group_type.slug` | **per `organization_id`** | identyfikuje ofertę w obrębie akademii: `.../zapisy/obozy-2026` |

Pełny URL publicznej rejestracji: `{organization.subdomain}.langlion.com/zapisy/{group_type.slug}`. Prefiks `/zapisy/` jest stały w routingu; `group_type.slug` przechowuje wyłącznie człon oferty (`obozy-2026`).

Uzasadnienie poziomu 1: cała witryna akademii (docelowo kreator stron per akademia) żyje pod jej subdomeną, a docelowo pod własną domeną klienta przez CNAME. Uzasadnienie poziomu 2: jedna akademia prowadzi równolegle wiele aktywnych ofert i linków rejestracyjnych (§EPIK 2, US-2.3 — kilka `group_type` naraz), a dwie różne akademie mogą zasadnie prowadzić ofertę o tej samej nazwie.

`organization.subdomain` jest odrębny od `organization.slug`, który pozostaje identyfikatorem panelu personelu (`/orgs/{slug}`). Oba są globalnie unikalne, ale odpowiadają przed różnymi autorytetami — DNS kontra routing wewnętrzny — więc scalenie ich związałoby przyszłą regułę DNS z adresami panelu.

**Middleware rozpoznający organizację z subdomeny nie jest częścią Fazy 0** — Faza 0 dostarcza wyłącznie kolumnę z walidacją i unikalnością. Rozpoznawanie tenanta z nagłówka `Host`, obsługa domen własnych przez CNAME, wildcard DNS/TLS oraz zachowanie na `localhost` w dev i e2e to osobna praca, blokująca przed EPIK 4 (publiczna rejestracja klienta), nie przed Fazą 0. Panel akademii do tego czasu działa wyłącznie na `/orgs/{slug}` i subdomeny nie potrzebuje.

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

---

Konwencja: Jako `<rola>`, chcę `<cel>`, aby `<korzyść>`. AC w formacie Given/When/Then. Numeracja `US-<EPIK>.<nr>` odpowiada sekcjom specyfikacji technicznej.

### EPIK 1 — Multi-tenancy i strefa czasowa

**US-1.1** Jako właściciel platformy, chcę, aby dane każdej akademii były fizycznie odizolowane od innych, aby błąd w jednej organizacji nie ujawnił danych innej.
- AC1: Given dwie organizacje A i B, When użytkownik zalogowany do A wykonuje dowolne zapytanie o session/booking/credit, Then zwracane są wyłącznie rekordy z `organization_id = A`, nawet jeśli warstwa aplikacji pominie filtr (RLS jako ostatnia linia obrony).
- AC2: Given nowy rekord session/booking/credit jest tworzony, When zapis następuje, Then `organization_id` jest ustawiane automatycznie z encji nadrzędnej i nie jest edytowalne przez API.

**US-1.2** Jako administrator akademii, chcę, aby godziny zajęć były zawsze zgodne z lokalnym czasem mojej akademii, niezależnie od zmiany czasu i strefy klienta.
- AC1: Given `group_type_recurrence` z `start_time=17:00` i `organization.timezone=Europe/Warsaw`, When system generuje sesje w okresie zmiany czasu (marzec/październik), Then każda wygenerowana sesja ma lokalną godzinę 17:00 w Warszawie (nie przesuniętą o godzinę).
- AC2: Given klient przegląda ofertę z innej strefy czasowej, When widzi godzinę zajęć, Then wyświetlana jest ona przeliczona na jego lokalną strefę, ale zapis w bazie i faktyczny czas zajęć pozostają w `organization.timezone`.
- AC3: Given kredyt z `valid_until` = koniec miesiąca, When liczona jest data wygaśnięcia, Then liczona jest w `organization.timezone`, nie UTC.

### EPIK 2 — Definicja typu zajęć i wzorca

**US-2.1** Jako administrator, chcę zdefiniować typ zajęć z ceną i silnikiem działania, aby móc otworzyć zapisy.
- AC1: Given tworzę `group_type`, When nie podam `price`, Then system odrzuca zapis (pole wymagane).
- AC2: Given zapisuję `group_type` z `engine=schedule_first`, When definiuję `group_type_recurrence`, Then muszę wskazać `trainer_id` (walidacja wymagana dla tego silnika).
- AC3: Given `engine=slot_first`, When definiuję `group_type`, Then nie jestem zmuszony wskazać trenera — system obliczy dostępność dynamicznie.
- AC4 (v15): Given tworzę/edytuję `group_type`, When wypełniam (lub pomijam) pole `description`, Then jest ono opcjonalne, przyjmuje treść w markdown i jest renderowane na publicznej stronie oferty (`{organization.subdomain}.langlion.com/zapisy/{slug}`, §2.27); brak opisu nie blokuje zapisu ani nie wpływa na żadną logikę rezerwacji ani cenową.

**US-2.2** Jako administrator, chcę edytować Definicję typu zajęć bez wpływu na już wygenerowane sesje z rezerwacjami.
- AC1: Given `group_type` ma wygenerowane sesje z aktywnymi rezerwacjami, When admin zmienia `price` lub `payment_policy` na Definicji, Then istniejące `booking.price_snapshot` pozostają niezmienione.
- AC2: Given zmiana Definicji, When kolejna sesja jest generowana z tego wzorca, Then nowa sesja/rezerwacja stosuje zaktualizowaną politykę.

**US-2.3** Jako administrator, chcę zdefiniować kilka wzorców (dni/godziny/trenerów) pod tym samym typem zajęć.
- AC1: Given `group_type` „Piłka nożna Junior", When dodaję dwa `group_type_recurrence` (pon 17:00/trener A, śr 18:00/trener B), Then oba są aktywne równolegle pod tym samym typem, a kredyty tego typu działają na obu.

### EPIK 3 — Generowanie grafiku (cykliczność)

**US-3.1** Jako administrator, chcę, aby zapisanie cyklicznego wzorca automatycznie wygenerowało cały sezon zajęć, bez osobnego kroku „Generuj".
- AC1: Given zaznaczam `is_recurring=true` i `occurrences_count=30`, When zapisuję `group_type_recurrence`, Then w tle tworzone jest zadanie generujące 30 rekordów `session`, bez dodatkowej akcji z mojej strony.
- AC2: Given `is_recurring=false`, When zapisuję wzorzec, Then powstaje dokładnie jedna sesja, synchronicznie.

**US-3.2** Jako administrator, chcę bezpiecznie przedłużyć sezon bez tworzenia duplikatów.
- AC1: Given wzorzec ma już 30 wygenerowanych sesji, When zwiększam `occurrences_count` do 40, Then generowane jest wyłącznie 10 nowych, brakujących sesji.
- AC2: Given generowanie zostało przerwane błędem w połowie, When zadanie jest ponawiane, Then istniejące sesje (unikalny constraint na `recurrence_id` + `start_time`) nie są duplikowane.

**US-3.3** Jako administrator, chcę zmniejszyć liczbę powtórzeń bez ryzyka utraty zarezerwowanych zajęć.
- AC1: Given wzorzec ma 30 wygenerowanych, częściowo zarezerwowanych sesji, When zmniejszam `occurrences_count` do 20, Then żadna z istniejących 30 sesji nie jest automatycznie usuwana.

**US-3.4** Jako administrator, chcę zmienić dzień/godzinę/lokalizację wzorca w trakcie trwania sezonu i mieć jeden spójny grafik.
- AC1: Given wzorzec „poniedziałek 17:00" ma przyszłe, nieodbyte sesje z rezerwacjami, When zmieniam godzinę na „poniedziałek 18:00", Then wszystkie przyszłe sesje tego wzorca są zaktualizowane w miejscu (UPDATE) na nową godzinę.
- AC2: Given te same sesje mają już odbyte terminy w historii, When zmiana jest zapisywana, Then odbyte sesje pozostają nietknięte.
- AC3: Given sesja ma aktywne rezerwacje, When jej godzina jest przesuwana, Then powiązane `booking` NIE są anulowane, a ich zdenormalizowane `session_start_time`/`end_time` są aktualizowane w tej samej transakcji.
- AC4: Given zmiana godziny/lokalizacji dotyka klientów z rezerwacjami, When zmiana jest zapisana, Then wysyłane jest powiadomienie do każdego dotkniętego klienta.
- AC5: Given nowa godzina koliduje z innymi zajęciami tego samego trenera, When system wykrywa kolizję, Then stosowana jest ta sama zasada co przy tworzeniu sesji w Schedule-First (ostrzeżenie + możliwość Force Override dla uprawnionej roli).
- AC6: Given aktualizacja sesji odbywa się w tym samym momencie, co próba utworzenia na niej nowego bookingu, When obie operacje trafiają na tę samą sesję, Then transakcja aktualizująca sesję bierze `SELECT ... FOR UPDATE` na jej wierszu — operacje są serializowane, druga czeka i działa na już zaktualizowanych danych.
- AC7: Given przesunięcie konkretnej sesji spowodowałoby kolizję z inną, niezależną aktywną rezerwacją tego samego zawodnika (constraint §5.3), When system wykrywa tę kolizję podczas masowej aktualizacji sezonu, Then wyłącznie ta jedna sesja jest pomijana — reszta sezonu przesuwa się normalnie, bez wycofywania całej operacji. Pominięta sesja trafia na listę do ręcznego rozwiązania przez admina, z podanym powodem kolizji.
- AC8: Given sesja ma `is_manually_adjusted=true` (admin wcześniej ręcznie zmienił jej czas lub lokalizację niezależnie od wzorca), When masowa aktualizacja z poziomu wzorca jest wykonywana, Then ta sesja jest pomijana — jej ręczna korekta nie zostaje nadpisana. System loguje ostrzeżenie i uwzględnia ją na tej samej liście pominiętych sesji co AC7.
- AC9: Given admin ręcznie zmienia `start_time`/`end_time` LUB `location_id` pojedynczej sesji (poza edycją wzorca), When zapis następuje, Then `is_manually_adjusted` jest ustawiane na `true`.
- AC10: Given sesja ma wymuszony konflikt trenera przez Force Override (§3.1), When ta sama sesja jest objęta masową aktualizacją wzorca, Then `is_manually_adjusted` NIE jest automatycznie ustawiane przez Force Override i nie chroni sesji przed nadpisaniem.

### EPIK 4 — Rejestracja i zapis klienta (ścieżka publiczna)

**US-4.1** Jako rodzic, chcę zapisać dziecko na zajęcia bez zakładania konta z góry.
- AC1: Given wchodzę na link rejestracji, When wypełniam formularz (dla kogo, dane uczestnika, dane kontaktowe, metoda płatności), Then system tworzy `client` (jeśli nie istnieje dla `(organization_id, email)`) z `is_verified=false` oraz `athlete`, bez wymagania logowania przed zapisem.

**US-4.2** Jako system, chcę rozpoznać istniejącego, zweryfikowanego klienta i skrócić mu ścieżkę zapisu.
- AC1: Given wpisuję e-mail pasujący do istniejącego `client` TEJ SAMEJ organizacji z `is_verified=true`, When system sprawdza w tle, Then pola formularza są automatycznie wypełnione danymi profilu, a krok OTP jest pomijany. Rekord `client` z innej organizacji nigdy nie jest dopasowywany (rewizja 14.1).
- AC2: Given jestem rozpoznanym klientem, When wybieram sesję z wolnym miejscem, Then rezerwacja jest finalizowana od razu, minimalną liczbą kroków.
- AC3: Given e-mail nie pasuje do żadnego zweryfikowanego `client` w tej organizacji, When kontynuuję zapis, Then przechodzę standardową ścieżkę z pełnym formularzem i weryfikacją OTP.
- AC4 (v15): Given jestem rozpoznany jako zweryfikowany klient (`is_verified=true` — ten sam moment, w którym pomijany jest OTP i uzupełniane są dane w AC1) ORAZ mam aktywny `client_price_override` (`is_active=true`, w oknie `valid_from`/`valid_until`) pasujący do wybranej oferty, When formularz renderuje cenę — zarówno dla pojedynczych zajęć (`group_type.price`), jak i dla listy pakietów (`product_template.price`) — Then wyświetlana jest cena PO zastosowaniu override (Constraint 9), zanim wybiorę metodę płatności i sfinalizuję zapis.
- AC5 (v15): Given jestem rozpoznany, ale nie mam aktywnego override pasującego do tej oferty, When formularz renderuje cenę, Then wyświetlana jest cena katalogowa — bez zmian względem stanu sprzed v15.
- AC6 (v15): Given jestem nowym lub niezweryfikowanym klientem, When wypełniam formularz, Then zawsze widzę cenę katalogową. Rabat nie jest prezentowany przed weryfikacją, nawet jeśli admin już go przyznał: `client_price_override` wskazuje na `client_id`, który istnieje od upsertu przy pierwszej próbie zapisu (§US-4.1), ale **wyświetlanie rabatu jest bramkowane tym samym progiem zaufania co reszta rozpoznania w AC1**, nie samym istnieniem rekordu.

**US-4.3** Jako administrator, chcę ograniczyć widoczność wybranej oferty do nowych klientów.
- AC1: Given `group_type.is_new_client_only=true`, When rozpoznany istniejący klient (§US-4.2) korzysta z tego samego linku, Then NIE zostaje odrzucony komunikatem „tylko dla nowych" — flaga działa jako priorytetowe kierowanie nowych klientów, nie twarda bramka.

**US-4.4** Jako klient, chcę wybrać metodę płatności przy zapisie, o ile typ grupy w ogóle dopuszcza zakup pojedynczych zajęć.
- AC1: Given `group_type.allowed_purchase_modes` zawiera `single_class`, When wypełniam formularz i wybieram „Płacę online", Then `booking.payment_status = payment_pending`.
- AC2: Given wybieram „Płacę na miejscu", When zapis jest finalizowany, Then `payment_status = booked_offline`.
- AC3: Given `group_type.payment_policy` nie dopuszcza wybranej metody, When wypełniam formularz, Then ta opcja płatności nie jest w ogóle prezentowana.
- AC4: Given `group_type.allowed_purchase_modes` NIE zawiera `single_class` (wyłącznie `package`), When przeglądam formularz rejestracji, Then opcja płatności za pojedyncze zajęcia w ogóle nie jest prezentowana.

**US-4.5** Jako klient, chcę potwierdzić rezerwację kodem OTP.
- AC1: Given zapis został utworzony, When system wysyła OTP (domenowy, scoped do `(organization_id, email)` — rewizja 14.1) i klient go poprawnie wpisuje, Then `client.is_verified` zmienia się na `true`.

**US-4.6** Jako klient, chcę mieć pewność, że cena i polityka płatności z momentu mojej rezerwacji nie zmienią się później.
- AC1: Given rezerwuję zajęcia przy cenie 100 zł, When admin później podniesie cenę `group_type.price` do 120 zł, Then moja istniejąca rezerwacja zachowuje `price_snapshot=100 zł`.

### EPIK 5 — Płatność online za pojedyncze zajęcia

**US-5.1** Jako klient, chcę zapłacić online i mieć potwierdzone miejsce automatycznie.
- AC1: Given `booking.payment_status=payment_pending`, When otrzymywany jest webhook Stripe potwierdzający płatność, Then system generuje jednostkę `credit` (`source=online_payment`) i natychmiast konsumuje ją na tę rezerwację w tej samej transakcji, zanim status zmieni się na `confirmed`.
- AC2: Given płatność została potwierdzona wyłącznie przez przekierowanie (redirect), ale webhook jeszcze nie dotarł, When sprawdzany jest status rezerwacji, Then rezerwacja NIE jest jeszcze `confirmed`.
- AC3: Given kredyt `online_payment` powstał i został skonsumowany atomowo, When klient sprawdza swój portfel kredytów, Then ten kredyt nigdy się w nim nie pojawia.

### EPIK 6 — Płatność na miejscu (pojedyncze zajęcia)

**US-6.1** Jako recepcja, chcę zatwierdzić otrzymaną gotówkę i potwierdzić miejsce klienta.
- AC1: Given `booking.payment_status=booked_offline`, When recepcja klika „Zatwierdź" po otrzymaniu gotówki, Then generowany jest `credit` (`source=on_site_payment`), natychmiast konsumowany na tę rezerwację, status zmienia się na `confirmed`.
- AC2: Given zatwierdzenie nastąpiło, When sprawdzany jest audit trail, Then zapisane jest kto, kiedy, która rezerwacja.

**US-6.2** Jako system, nie chcę automatycznie zwalniać miejsca klientowi, który nie zapłacił przed zajęciami.
- AC1: Given rezerwacja pozostaje `booked_offline` do godziny zajęć, When zajęcia się rozpoczynają, Then system NIE zmienia statusu ani nie zwalnia miejsca automatycznie.

**US-6.3** Jako trener, chcę widzieć na liście uczestników, kto zapłacił, a kto nie.
- AC1: Given lista uczestników sesji, When trener ją otwiera, Then rezerwacje `confirmed` są oznaczone na zielono, a `booked_offline` na żółto/pomarańczowo.

### EPIK 7 — System kredytowy: portfel i konsumpcja

**US-7.1** Jako system, chcę zawsze konsumować kredyt, który wygasa najwcześniej.
- AC1: Given klient ma dwa ważne kredyty tego samego typu z różnymi datami ważności, When system konsumuje kredyt na nową rezerwację, Then wybrany zostaje ten z wcześniejszym `valid_until` (FIFO).

**US-7.2** Jako system, chcę uniknąć podwójnej konsumpcji tego samego, ostatniego ważnego kredytu przy równoległych operacjach.
- AC1: Given klient ma dokładnie jeden ważny kredyt, When w tym samym momencie następuje auto-dopisanie i ręczna korekta admina, Then tylko jedna z dwóch operacji skutecznie konsumuje ten kredyt.

**US-7.3** Jako administrator, chcę ręcznie dodać kredyty klientowi z udokumentowanym powodem.
- AC1: Given wchodzę w profil klienta, When dodaję kredyty bez podania powodu, Then system odrzuca zapis (pole wymagane).
- AC2: Given kredyty zostały dodane, When sprawdzam audit trail, Then widoczne jest kto, komu, ile, jaki typ, jaki powód, kiedy.

**US-7.4** Jako rodzic z kilkorgiem dzieci, chcę mieć kredyty dostępne dla dowolnego z nich.
- AC1: Given kupuję pakiet i wybieram „dla dowolnego z moich dzieci", When kredyty są tworzone, Then `credit.athlete_id = NULL`.
- AC2: Given mam kredyt rodzinny i kredyt przypisany do konkretnego dziecka, When rezerwuję zajęcia dla tego dziecka, Then system priorytetyzuje dopasowanie do konkretnego dziecka przed kredytem rodzinnym.

**US-7.5** Jako rodzic, chcę przenieść niewykorzystany kredyt jednego dziecka na drugie.
- AC1: Given dziecko A ma niewykorzystany kredyt przypisany wyłącznie do niego, When składam wniosek o przeniesienie na dziecko B, Then wniosek trafia do kolejki admina/recepcji.
- AC2: Given próbuję przenieść kredyt na dziecko innego klienta, When składam wniosek, Then system odrzuca operację.
- AC3: Given admin zatwierdza wniosek, When zatwierdzenie następuje, Then `credit.athlete_id` jest aktualizowane, kredyt pozostaje `available`, a operacja jest logowana w audit trail.
- AC4: Given kredyt jest rodzinny (`athlete_id=NULL`), When rodzic próbuje złożyć wniosek o przeniesienie, Then mechanizm nie jest potrzebny.

**US-7.6** Jako klient, chcę widzieć swój portfel kredytów tylko wtedy, gdy faktycznie mam z czego korzystać.
- AC1: Given saldo `available` klienta = 0, When klient otwiera swój panel, Then sekcja „Portfel kredytów" nie jest widoczna.
- AC2: Given klient ma 2 kredyty z pakietu i 1 z odwołania zajęć, When otwiera portfel, Then widzi obie pozycje z osobnym źródłem i datą ważności.
- AC3: Given klient płaci online za pojedyncze zajęcia i płatność się powodzi, When sprawdza portfel, Then saldo pozostaje 0.
- AC4: Given klient ma nadchodzące potwierdzone zajęcia, When otwiera panel, Then sekcja „Nadchodzące zajęcia" jest zawsze widoczna, niezależnie od stanu portfela kredytów.

### EPIK 8 — Dopisanie (self-service)

**US-8.1** Jako klient, chcę dopisać się na dodatkowy termin w ramach typu, do którego należę.
- AC1: Given mam ważny, pasujący kredyt, When wybieram dodatkowy termin, Then system konsumuje istniejący kredyt (FIFO) zamiast kierować mnie do zakupu.
- AC2: Given nie mam pasującego, ważnego kredytu, When próbuję się dopisać, Then jestem kierowany do zakupu nowej jednostki, a rezerwacja finalizuje się dopiero po zakupie.
- AC3: Given wybrana sesja osiągnęła `capacity`, When próbuję się dopisać mimo posiadania ważnego kredytu, Then rezerwacja jest odrzucana.

### EPIK 9 — Zakup pakietu z auto-wypełnieniem terminów (Schedule-First)

**US-9.1** Jako klient, chcę kupić pakiet na moją stałą grupę i mieć automatycznie zarezerwowane najbliższe terminy.
- AC1: Given `group_type.engine=schedule_first` z jednym wzorcem, When kupuję pakiet `credit_quantity=4`, Then po potwierdzeniu płatności system podejmuje dokładnie jedną próbę zapisania mnie na 4 najbliższe, nieodbyte sesje tego wzorca.
- AC2: Given `group_type` ma więcej niż jeden wzorzec, When kupuję pakiet, Then muszę wskazać `target_recurrence_id`.
- AC3: Given próba zapisu na jeden z terminów napotyka pełną pojemność lub kolizję, When system to wykrywa, Then NIE ponawia próby — kredyt pozostaje `available`.
- AC4: Given część terminów została zarezerwowana, a część nie, When zakup się kończy, Then otrzymuję powiadomienie z dokładną listą.
- AC5: Given `group_type.engine` to `slot_first` lub `availability_first`, When kupuję pakiet, Then NIE następuje żadna próba auto-zapisu.

**US-9.2** Jako klient z subskrypcją, chcę, aby każde odnowienie ponownie próbowało zapisać mnie na najbliższe terminy.
- AC1: Given subskrypcja się odnawia (kolejny webhook `invoice.paid`), When nowe kredyty są generowane, Then ponownie wykonywana jest próba auto-wypełnienia.
- AC2: Given ten sam webhook odnowienia dociera dwukrotnie, When system go przetwarza, Then kredyty nie są generowane podwójnie.

### EPIK 10 — Zakup pakietu gotówką na miejscu

**US-10.1** Jako recepcja, chcę sprzedać klientowi pakiet gotówką bez integracji płatniczej.
- AC1: Given klient chce kupić pakiet na miejscu, When wybieram `product_template`, `athlete_id` (i `target_recurrence_id` jeśli dotyczy) i zatwierdzam otrzymanie gotówki, Then to zatwierdzenie jest jedynym potwierdzeniem płatności i jest logowane w audit trail.
- AC2: Given zatwierdzenie nastąpiło, When zadanie w tle przetwarza zakup, Then tworzone jest `credit_quantity` rekordów `credit`.

**US-10.2** Jako klient z zaległymi rezerwacjami „do zapłaty", chcę, aby zakup pakietu automatycznie je rozliczył.
- AC1: Given mam dwie rezerwacje `booked_offline` pasujące pod kupowany typ kredytu, When kupuję pakiet 4 kredytów gotówką, Then system najpierw automatycznie konsumuje kredyty FIFO na te dwie zaległe rezerwacje.
- AC2: Given po rozliczeniu zaległości zostały jeszcze 2 kredyty, When podano `target_recurrence_id`, Then dopiero teraz następuje próba auto-wypełnienia najbliższych terminów.
- AC3: Given po obu krokach zostały kredyty niewykorzystane, When zakup się kończy, Then trafiają one do portfela jako w pełni wolne.
- AC4: Given rozliczana jest każda zaległa rezerwacja, When konsumpcja następuje, Then przechodzi przez ten sam atomowy mechanizm blokady co standardowa konsumpcja FIFO.

### EPIK 11 — Zmiana Grupy (swap) — group_change_request

**US-11.1** Jako klient, chcę złożyć wniosek o zmianę terminu na inny.
- AC1: Given składam wniosek wskazując obecną rezerwację i docelową sesję, When wysyłam wniosek, Then tworzony jest `group_change_request` w statusie `submitted`.

**US-11.2** Jako administrator, chcę zweryfikować wykonalność wniosku i wyzwolić dalszy proces, bez samodzielnego ściągania pieniędzy od klienta.
- AC1: Given docelowa sesja jest pełna, When admin próbuje zatwierdzić wniosek, Then zatwierdzenie jest blokowane przez constraint pojemności (§5.2).
- AC2: Given admin zatwierdza wniosek, When zatwierdzenie następuje, Then `group_change_request.status → admin_approved`, a `price_difference` jest wyliczana i zamrażana w tym momencie.
- AC3: Given `price_difference > 0` (dopłata), When wniosek przechodzi w `admin_approved`, Then system NIE obciąża automatycznie żadnej zapisanej metody płatności klienta.
- AC4: Given admin odrzuca wniosek, When decyzja jest zapisywana, Then status → `admin_rejected` z wymaganym `rejection_reason`.

**US-11.3** Jako klient, chcę samodzielnie i świadomie opłacić różnicę wynikającą ze zmiany grupy, bez ryzyka automatycznego obciążenia.
- AC1: Given wniosek przeszedł w `admin_approved` z `price_difference > 0`, When system to przetwarza, Then generowana jest nowa `booking` na docelowej sesji ze statusem `payment_pending` i `price_snapshot` = pełna cena docelowej grupy, a kwota do faktycznej zapłaty jest tworzona jako osobny Stripe PaymentIntent na `price_difference`. `group_change_request.expires_at` ustawiane na `now() + 24h`.
- AC2: Given nowa `booking` istnieje w `payment_pending`, When sprawdzana jest pojemność docelowej sesji, Then ta rezerwacja liczy się jako aktywna i blokuje miejsce.
- AC3: Given klient otwiera link i płaci, When webhook Stripe potwierdza PaymentIntent, Then dopiero wtedy operacja jest finalizowana w jednej transakcji.
- AC4: Given `price_difference = 0`, When wniosek przechodzi w `admin_approved`, Then przesunięcie następuje od razu bez pośredniego kroku płatności.
- AC5: Given `price_difference < 0`, When wniosek przechodzi w `admin_approved`, Then swap jest finalizowany od razu, a różnica jest zwracana klientowi jako rzeczywisty zwrot pieniędzy.
- AC6: Given webhook PaymentIntent potwierdzający tę samą płatność dociera dwukrotnie, When system przetwarza drugą dostawę, Then sprawdza aktualny status przed zastosowaniem efektów.

**US-11.4** Jako administrator, chcę, aby niedopłacony wniosek nie blokował miejsca w nieskończoność.
- AC1: Given `group_change_request` w `awaiting_payment` ma `expires_at < now()`, When cykliczne zadanie w tle je sprawdza, Then status → `expired`, powiązana `payment_pending` `booking` → `cancelled`.
- AC2: Given wniosek wygasł, When operacja się kończy, Then klient otrzymuje powiadomienie, a oryginalna rezerwacja klienta pozostaje nietknięta.

**US-11.5** Jako klient lub administrator, chcę móc wycofać się z zatwierdzonej, ale jeszcze nieopłaconej zmiany grupy.
- AC1: Given wniosek jest w `admin_approved`/`awaiting_payment`, When klient anuluje go samodzielnie, Then status → `cancelled_by_client`, powiązana `booking` → `cancelled`.
- AC2: Given wniosek jest w tym samym stanie, When admin anuluje go, Then status → `cancelled_by_admin` z wymaganym `cancellation_reason`.
- AC3: Given wniosek został już sfinalizowany (`completed`), When ktokolwiek próbuje go anulować, Then operacja jest niedozwolona.

**US-11.6** Jako system, chcę bezpiecznie obsłużyć odwołanie sesji docelowej w trakcie oczekiwania klienta na płatność.
- AC1: Given admin odwołuje całą sesję, When istnieją powiązane `group_change_request` w `awaiting_payment`, Then każdy taki wniosek automatycznie przechodzi w `cancelled_by_admin`.
- AC2: Given powyższy scenariusz, When operacja się kończy, Then klient otrzymuje powiadomienie, a jego oryginalna rezerwacja pozostaje nietknięta.

**US-11.7** Jako administrator, chcę mieć pełny ślad audytowy każdej decyzji w cyklu życia wniosku.
- AC1: Given dowolne przejście stanu, When przejście następuje, Then jest ono logowane w audit trail (boilerplate §6.4).

**US-11.8** Jako klient, nie chcę móc jednocześnie odwoływać rezerwacji i zmieniać jej na inną grupę.
- AC1: Given moja rezerwacja ma już otwarty `group_change_request`, When próbuję odwołać tę samą rezerwację standardową ścieżką 24h, Then system odrzuca odwołanie.
- AC2: Given moja rezerwacja jest już w trakcie przetwarzania odwołania, When próbuję złożyć wniosek o zmianę grupy na tej samej rezerwacji, Then system odrzuca nowy wniosek.
- AC3: Given wniosek o zmianę grupy został anulowany/wygasł/odrzucony, When sprawdzam możliwość odwołania, Then odwołanie jest ponownie dostępne.

### EPIK 12 — Anulowanie i reguła 24h

**US-12.1** Jako klient, chcę odwołać zajęcia z odpowiednim wyprzedzeniem i otrzymać kredyt kompensacyjny — wyłącznie za to, co faktycznie opłaciłem.
- AC1: Given `session.start_time - now() >= 24h` oraz `booking.payment_status = confirmed` w momencie odwołania, When odwołuję rezerwację, Then `booking.payment_status → cancelled` i tworzony jest `credit` (`source=cancellation`).
- AC2: Given próbuję odwołać zajęcia mniej niż 24h przed startem, When wysyłam żądanie, Then system odrzuca odwołanie.
- AC3: Given `booking.payment_status = booked_offline`, When odwołuję ją, Then `payment_status → cancelled`, ale żaden kredyt kompensacyjny NIE jest generowany.
- AC4: Given odwołanie się powiodło, When slot trenera jest sprawdzany, Then jest on od razu dostępny dla innych rezerwacji.

**US-12.2** Jako administrator, chcę anulować rezerwację klienta, aby zwolnić miejsce dla innego uczestnika, bez karania anulowanego klienta — ale tylko jeśli było co kompensować.
- AC1: Given admin anuluje opłaconą (`confirmed`) rezerwację klienta X, When anulowanie następuje mniej niż 24h przed zajęciami, Then klient X i tak otrzymuje kredyt kompensacyjny.
- AC2: Given admin anuluje nieopłaconą (`booked_offline`) rezerwację klienta X, When anulowanie następuje, Then klient X nie otrzymuje kredytu.

**US-12.3** Jako system, chcę uniemożliwić odwołanie rezerwacji, która jest właśnie w trakcie zmiany na inną grupę.
- AC1: Given rezerwacja ma otwarty `group_change_request`, When klient lub admin próbuje ją odwołać standardową ścieżką, Then odwołanie jest blokowane.
- AC2: Given wniosek o zmianę grupy zostaje anulowany/wygasa/jest odrzucony, When sprawdzam ponownie możliwość odwołania, Then jest ono znów dostępne.

### EPIK 13 — Odrabianie

**US-13.1** Jako klient, chcę wykorzystać kredyt z odwołania na inny termin tego samego typu zajęć.
- AC1: Given mam kredyt `source=cancellation` typu „Piłka nożna Junior", When wybieram inny wzorzec tego samego typu, Then mogę wykorzystać kredyt tym samym mechanizmem co Dopisanie.
- AC2: Given próbuję wykorzystać ten kredyt na inny typ zajęć, When wybieram sesję niepasującego typu, Then system odrzuca.

### EPIK 14 — Ochrona przed race conditions (przekrój wszystkich ścieżek)

**US-14.1** Jako system, chcę zagwarantować, że żaden trener nigdy nie zostanie zapisany na dwie nakładające się sesje.
- AC1: Given trener ma sesję 17:00-18:00, When ktokolwiek próbuje utworzyć dla niego drugą sesję 17:30-18:30, Then baza danych odrzuca zapis (exclusion constraint).
- AC2: Given constraint odrzucił zapis, When aplikacja to wykrywa, Then klientowi zwracany jest komunikat „ten termin właśnie zajęto, wybierz inny".

**US-14.2** Jako system, chcę zagwarantować, że sesja nigdy nie przekroczy zdefiniowanej pojemności, nawet przy równoczesnych zapisach.
- AC1: Given sesja ma 1 wolne miejsce, When dwóch klientów klika „zapisz" w tym samym momencie, Then tylko jedna transakcja kończy się sukcesem.
- AC2: Given powyższy scenariusz dotyczy dowolnej ścieżki, When sprawdzam pokrycie, Then wszystkie ścieżki przechodzą przez ten sam mechanizm blokady.
- AC3: Given sesja jest pełna, When Owner/Admin próbuje wymusić zapis mimo pełnej pojemności, Then NIE istnieje żaden mechanizm obejścia dla żadnej roli.
- AC4: Given atomowa transakcja obejmuje blokadę sesji + sprawdzenie pojemności + konsumpcję kredytu + utworzenie bookingu, When którykolwiek krok zawiedzie, Then cała transakcja jest wycofywana.

**US-14.3** Jako system, chcę zagwarantować, że ten sam zawodnik nigdy nie zostanie zapisany na dwie nakładające się czasowo sesje.
- AC1: Given zawodnik ma aktywną rezerwację 17:00-18:00 na Typie A, When jest zapisywany na sesję 17:30-18:30 Typu B u innego trenera, Then baza odrzuca zapis.
- AC2: Given admin próbuje obejść to sprawdzenie, When próbuje zapisać tego samego zawodnika na nakładające się sesje, Then constraint nadal blokuje operację.
- AC3: Given godzina sesji jest edytowana, When zmiana jest zapisywana, Then zdenormalizowane `session_start_time`/`end_time` we wszystkich powiązanych `booking` są aktualizowane w tej samej transakcji.

**US-14.4** Jako administrator, chcę mieć legalny sposób przyjęcia dodatkowego uczestnika do pełnej sesji.
- AC1: Given sesja osiągnęła `capacity`, When podnoszę `session.capacity` o 1, Then nowy zapis może przejść przez standardowe sprawdzenie z podwyższonym limitem.
- AC2: Given podniosłem `capacity` i później ktoś się wypisze, When zwolnione miejsce jest sprawdzane, Then pozostaje ono dostępne dla kolejnego zapisu.
- AC3: Given podnoszę `capacity`, When wykonuję tę operację, Then wymagane jest uprawnienie `sessions.manage`.

**US-14.5** Jako administrator, chcę mieć jasność, że konflikt trenera i przekroczenie pojemności to dwa różne mechanizmy z różnymi zasadami.
- AC1: Given konflikt grafiku trenera, When Owner/Admin z uprawnieniem `sessions.force_override` próbuje wymusić zapis, Then system pozwala.
- AC2: Given przekroczenie pojemności grupy, When ten sam Owner/Admin próbuje użyć `sessions.force_override`, Then uprawnienie to NIE daje możliwości przyjęcia uczestnika ponad capacity.

### EPIK 15 — Brak listy rezerwowej

**US-15.1** Jako klient, chcę wiedzieć wprost, że miejsce jest niedostępne, bez dołączania do kolejki.
- AC1: Given sesja osiągnęła `capacity`, When próbuję się zapisać, Then formularz rezerwacji po prostu nie pozwala mi się zapisać.
- AC2: Given chcę mimo to skorzystać z tego typu zajęć, When sprawdzam dostępność, Then muszę wybrać inny termin tego samego wzorca albo poczekać na kolejny sezon.

### EPIK 16 — Panel trenera i recepcji

**US-16.1** Jako trener, chcę widzieć status płatności moich uczestników, ale nie musieć samodzielnie zatwierdzać gotówki.
- AC1: Given jestem trenerem prowadzącym zajęcia, When przeglądam listę uczestników, Then widzę statusy, ale zatwierdzenie płatności na miejscu wymaga uprawnienia `credits.confirm_on_site`.

**US-16.2** Jako trener/recepcja, chcę oznaczyć nieobecność uczestnika.
- AC1: Given klient nie pojawił się i nie odwołał zajęć, When oznaczam `no_show`, Then status jest zapisany, ale system nie wywołuje żadnej automatycznej konsekwencji.

### EPIK 17 — RBAC

**US-17.1** Jako administrator systemu, chcę mieć pewność, że uprawnienia są egzekwowane na backendzie, nie tylko ukrywane w UI.
- AC1: Given użytkownik bez uprawnienia `sessions.force_override` wysyła bezpośrednie żądanie API, When żądanie dociera do backendu, Then jest ono odrzucane niezależnie od tego, co pokazuje UI.
- AC2: Given żadna rola nie posiada uprawnienia „przekrocz pojemność sesji", When przeszukiwana jest mapa RBAC, Then takie uprawnienie nie istnieje w systemie.

### EPIK 18 — Zwroty fiducjarne

**US-18.1** Jako administrator, chcę wybrać wariant zwrotu osobno dla każdego przypadku.
- AC1: Given klient nie wykorzystał żadnego kredytu z zakupu, When wybieram wariant zwrotu, Then oba warianty dają identyczny wynik.
- AC2: Given klient wykorzystał część kredytów, When wybieram „zwrot częściowy", Then zwracana kwota = (niewykorzystane / zakupione) × `price_paid`.
- AC3: Given klient wykorzystał część kredytów na przyszłe rezerwacje, When wybieram „zwrot pełny z cofnięciem", Then niewykorzystane kredyty są unieważniane, a przyszłe rezerwacje z już skonsumowanych kredytów są cofane.

**US-18.2** Jako administrator, chcę, aby zwrot zakupu opłaconego online był rzeczywiście wykonany dopiero po potwierdzeniu przez bramkę płatności.
- AC1: Given `credit_purchase.payment_method = online`, zatwierdzam zwrot, When czekam na wynik, Then wybrany wariant jest stosowany dopiero po otrzymaniu webhooka `charge.refunded`.
- AC2: Given zwrot został potwierdzony, When sprawdzam `credit_purchase`, Then `refunded_at` i `refund_amount` są zaktualizowane.
- AC3: Given zwrot został potwierdzony, When klient sprawdza swoją skrzynkę, Then otrzymuje e-mail z kwotą i wariantem zwrotu (przez Notification Center).
- AC4: Given wywołanie Stripe Refund API kończy się błędem, When system otrzymuje odpowiedź błędu, Then zwrot NIE jest oznaczany jako wykonany.
- AC5: Given admin klika „zatwierdź zwrot", When system to przetwarza, Then w tej samej transakcji wszystkie niewykorzystane kredyty przechodzą w `status=pending_refund`.
- AC6: Given webhook `charge.refunded` potwierdza zwrot, When system go przetwarza, Then kredyty w `pending_refund` przechodzą w `refunded`; w razie błędu wracają do `available`.

**US-18.3** Jako administrator/recepcja, chcę zwrócić klientowi zakup opłacony gotówką.
- AC1: Given `credit_purchase.payment_method = cash`, When wybieram wariant zwrotu i klikam „Potwierdzam zwrot gotówki", Then to potwierdzenie jest źródłem prawdy.
- AC2: Given zwrot gotówkowy jest potwierdzany, When operacja się kończy, Then jest logowana w audit trail oraz klient otrzymuje powiadomienie.
- AC3: Given wybrany wariant to „zwrot pełny z cofnięciem", When jest stosowany dla zakupu gotówkowego, Then zasady cofania są identyczne jak dla zwrotu online.

### EPIK 19 — Powiadomienia

**US-19.1** Jako klient, chcę być informowany o zdarzeniach dotyczących moich rezerwacji.
- AC1: Given dowolne z: zatwierdzenie zmiany grupy, zatwierdzenie przeniesienia kredytu, odwołanie zajęć przeze mnie, zwrot potwierdzony, kredyt wygasa za 7 dni, częściowe auto-wypełnienie pakietu, zmiana lokalizacji zajęć, nieudana płatność subskrypcyjna, When zdarzenie następuje, Then otrzymuję odpowiednie powiadomienie zgodnie z moimi preferencjami kanałów (§2.16).

**US-19.2** Jako administrator, chcę, aby odwołanie całej sesji powiadomiło wszystkich naraz i zrekompensowało tych, którzy faktycznie zapłacili.
- AC1: Given admin odwołuje całą sesję, When operacja jest wykonywana, Then `session.status=cancelled`, a dla każdej powiązanej opłaconej `booking` generowany jest `credit` (`source=admin_session_cancellation`).
- AC2: Given wśród powiązanych rezerwacji są też `booked_offline`, When są anulowane wraz z sesją, Then kredyt kompensacyjny NIE jest dla nich generowany.
- AC3: Given odwołanie się powiodło, When operacja się kończy, Then wszyscy dotknięci klienci otrzymują powiadomienie jednocześnie.
- AC4: Given istnieją `group_change_request` w stanie `awaiting_payment` wskazujące odwoływaną sesję, When sesja jest odwoływana, Then zastosowanie ma US-11.6.

### EPIK 20 — Soft delete i archiwizacja

**US-20.1** Jako administrator, chcę dezaktywować typ zajęć/trenera/typ kredytu bez utraty historii.
- AC1: Given dezaktywuję `group_type`, When sprawdzam istniejące sesje/rezerwacje, Then pozostają one nietknięte.
- AC2: Given próbuję dezaktywować trenera z nadchodzącymi sesjami, When wykonuję operację, Then system pokazuje ostrzeżenie z listą sesji, ale nie blokuje twardo.
- AC3: Given dezaktywuję `credit_type`, When klient próbuje kupić nowy kredyt tego typu, Then zakup jest niedostępny, ale istniejące kredyty działają do naturalnego wygaśnięcia.

### EPIK 21 — Reasygnacja: trenerzy, sesje, dezaktywacja Definicji

**US-21.1** Jako administrator, chcę dezaktywować profil trenera, ale nie stracić kontroli nad jego przyszłymi zajęciami.
- AC1: Given trener ma co najmniej jedną przyszłą, nieodbytą sesję, When próbuję dezaktywować jego profil, Then operacja jest blokowana.
- AC2: Given rozwiązałem wszystkie przyszłe sesje trenera, When ponawiam dezaktywację, Then operacja się powodzi.
- AC3: Given trener nie ma żadnych przyszłych sesji, When dezaktywuję jego profil od razu, Then operacja przechodzi bez blokady.
- AC4: Given lista blokujących sesji, When rozwiązuję je wyłącznie częściowo i próbuję ponowić dezaktywację, Then operacja nadal jest blokowana.

**US-21.2** Jako administrator, chcę zmienić trenera w pojedynczej sesji.
- AC1: Given zmieniam trenera w konkretnej `session`, When nowy trener ma kolizję czasową, Then operacja jest odrzucana przez constraint §5.1.
- AC2: Given nowy trener jest wolny w tym terminie, When zapisuję zmianę, Then sesja jest zaktualizowana, a operacja logowana w audit trail.

**US-21.3** Jako administrator, chcę zmienić trenera dla wielu przyszłych sesji na raz, bez ryzyka, że jedna kolizja zablokuje całą operację.
- AC1: Given wskazuję nowego trenera dla N przyszłych sesji, When operacja jest wykonywana, Then każda sesja jest aktualizowana w osobnej transakcji.
- AC2: Given jedna z N sesji koliduje z istniejącym grafikiem nowego trenera, When system to wykrywa, Then tylko ta sesja jest pomijana.
- AC3: Given operacja się kończy, When admin sprawdza wynik, Then widzi zbiorczy raport.
- AC4: Given zmiana trenera dotyczy sesji z aktywnymi rezerwacjami, When operacja się powiedzie, Then klienci NIE otrzymują dodatkowego, natychmiastowego powiadomienia poza standardowymi regułami z §2.16.

**US-21.4** Jako administrator, chcę odwołać sesję i wybrać, czy kompensować kredytem, czy przenieść uczestników.
- AC1: Given odwołuję sesję standardowo, When operacja się kończy, Then stosowane są zasady z §2.11/US-19.2.
- AC2: Given wybieram opcję „Przenieś uczestników" i wskazuję sesję docelową tego samego `group_type`, When operacja jest wykonywana, Then dla każdego uczestnika osobno sprawdzane są capacity i kolizja zawodnika.
- AC3: Given uczestnik przechodzi oba sprawdzenia, When jest przenoszony, Then jego istniejąca `booking` jest aktualizowana (UPDATE), nie anulowana i tworzona od nowa.
- AC4: Given uczestnik nie mieści się w sesji docelowej lub ma kolizję, When system to wykrywa, Then ten uczestnik NIE jest przenoszony automatycznie i NIE otrzymuje automatycznego kredytu.
- AC5: Given próbuję wskazać sesję docelową innego `group_type`, When wybieram cel, Then operacja jest niedostępna.
- AC6: Given operacja się kończy, When admin sprawdza wynik, Then widzi zbiorczy raport.

**US-21.5** Jako administrator, chcę mieć pewność, że masowa aktualizacja grafiku nigdy nie nadpisze cichym błędem ręcznej korekty, którą wcześniej świadomie wprowadziłem.
- AC1–AC2: patrz §3.4/AC8–AC9 (flaga `is_manually_adjusted`, obejmująca odtąd również lokalizację).
- AC3: patrz §3.4/AC10 — Force Override nie ustawia tej flagi.

**US-21.6** Jako administrator, chcę mieć pewność, że nie da się „po cichu" dezaktywować oferty, która nadal jest w użyciu.
- AC1: Given `group_type` ma powiązany `group_type_recurrence` z `is_recurring=true`, When próbuję dezaktywować `group_type`, Then operacja jest blokowana.
- AC2: Given `group_type` ma przyszłe, nieodbyte sesje, When próbuję dezaktywować, Then operacja jest blokowana.
- AC3: Given zatrzymałem generowanie i rozwiązałem wszystkie przyszłe sesje, When ponawiam dezaktywację, Then operacja się powodzi.

### EPIK 22 — Lokalizacje

**US-22.1** Jako administrator, chcę zdefiniować listę lokalizacji mojej akademii, aby móc przypisywać do nich zajęcia.
- AC1: Given tworzę `location` z nazwą „Hala Centrum", When zapisuję, Then lokalizacja jest dostępna do wyboru przy definiowaniu typów grup i wzorców w mojej organizacji.
- AC2: Given próbuję dezaktywować lokalizację przypisaną do przyszłych, nieodbytych sesji, When wykonuję operację, Then system pokazuje ostrzeżenie z listą/liczbą dotkniętych sesji, ale nie blokuje twardo.

**US-22.2** Jako administrator, chcę ustawić domyślną lokalizację dla typu grupy, aby nie wybierać jej ręcznie przy każdym wzorcu.
- AC1: Given ustawiam `group_type.default_location_id`, When tworzę nowy `group_type_recurrence` bez wskazania własnej lokalizacji, Then wygenerowane sesje dziedziczą lokalizację z typu grupy.
- AC2: Given wzorzec ma ustawioną własną `location_id`, When generowane są sesje, Then dziedziczą lokalizację wzorca, nie typu grupy.

**US-22.3** Jako administrator, chcę zmienić lokalizację pojedynczej sesji, bez wpływu na resztę sezonu.
- AC1: Given ręcznie zmieniam `location_id` konkretnej sesji, When zapisuję, Then `session.is_manually_adjusted` jest ustawiane na `true`.
- AC2: Given sesja ma `is_manually_adjusted=true` z tego powodu, When admin później zmienia lokalizację na poziomie wzorca dla całego sezonu, Then ta sesja jest pomijana przy masowej aktualizacji.

**US-22.4** Jako administrator, chcę zmienić lokalizację dla całego wzorca w trakcie sezonu i mieć spójny grafik.
- AC1: Given zmieniam `group_type_recurrence.location_id`, When zapisuję zmianę, Then wszystkie przyszłe, nieodbyte sesje tego wzorca (poza tymi z `is_manually_adjusted=true`) są aktualizowane w miejscu na nową lokalizację.
- AC2: Given zmiana lokalizacji dotyka klientów z rezerwacjami, When zmiana jest zapisana, Then wysyłane jest powiadomienie do każdego dotkniętego klienta.

**US-22.5** Jako klient/trener, chcę widzieć, gdzie odbywają się zajęcia.
- AC1: Given przeglądam potwierdzenie rezerwacji, powiadomienie przypominające lub panel trenera, When wyświetlana jest sesja, Then widoczna jest jej `location_id` (nazwa i adres).
- AC2: Given akademia ma tylko jedną aktywną lokalizację, When klient przegląda ofertę, Then lokalizacja jest nadal wyświetlana, ale nie jest wymagana jako krok wyboru przy rezerwacji.

### EPIK 23 — Tryby zakupu i rozliczenia per typ grupy

**US-23.1** Jako administrator, chcę zdefiniować, czy klient może kupić pojedyncze zajęcia, pakiet, czy oba warianty dla danego typu grupy.
- AC1: Given tworzę/edytuję `group_type`, When nie zaznaczę żadnej wartości w `allowed_purchase_modes`, Then system odrzuca zapis.
- AC2: Given ustawiam wyłącznie `package`, When klient próbuje zarezerwować zajęcia tego typu bez posiadania ważnego, pasującego kredytu, Then jedyna dostępna ścieżka to zakup pakietu.
- AC3: Given ustawiam wyłącznie `single_class`, When klient rezerwuje zajęcia, Then płaci każdorazowo za pojedyncze wejście — zakup pakietu nie jest oferowany.
- AC4: Given ustawiam oba tryby, When klient przegląda ofertę, Then widzi zarówno opcję jednorazowej płatności, jak i zakupu pakietu.

**US-23.2** Jako administrator, chcę ograniczyć, jakie rodzaje rozliczenia pakietu są dostępne dla danego typu grupy.
- AC1: Given `allowed_purchase_modes` zawiera `package`, When zapisuję `group_type` bez wskazania `allowed_billing_types`, Then system odrzuca zapis.
- AC2: Given ustawiam `allowed_billing_types = {one_time}`, When administrator próbuje utworzyć `product_template` z `billing_type=recurring` powiązany z tym typem grupy, Then zapis jest odrzucany.
- AC3: Given `allowed_purchase_modes` NIE zawiera `package`, When administrator próbuje utworzyć jakikolwiek `product_template` powiązany z tym typem grupy, Then zapis jest odrzucany.

**US-23.3** Jako klient, chcę widzieć przy zakupie pakietu wyłącznie te opcje rozliczenia, które akademia faktycznie oferuje dla tej grupy.
- AC1: Given typ grupy dopuszcza wyłącznie `recurring`, When klient przegląda ofertę pakietów, Then widzi wyłącznie opcję subskrypcji.
- AC2: Given typ grupy dopuszcza oba warianty, When klient przegląda ofertę, Then widzi wszystkie aktywne `product_template` powiązane z tym typem grupy, pogrupowane wg `billing_type`.

**US-23.4** Jako administrator, chcę mieć pewność, że nie da się włączyć trybu pakietowego bez faktycznie istniejącego pakietu do kupienia.
- AC1: Given ustawiam `allowed_purchase_modes = {package}`, ale nie istnieje żaden aktywny `product_template` powiązany z jego `credit_type`, When klient próbuje zarezerwować zajęcia, Then system pokazuje komunikat „brak dostępnych pakietów — skontaktuj się z akademią".
- AC2: Given administrator próbuje opublikować typ grupy w tym stanie, When zapisuje zmianę, Then system pokazuje ostrzeżenie (nie twardą blokadę).

**US-23.5** Jako administrator, chcę zmienić tryb zakupu typu grupy bez wpływu na już opłacone rezerwacje.
- AC1: Given klient ma aktywną rezerwację opłaconą w trybie `single_class`, When administrator zmienia `group_type.allowed_purchase_modes` na wyłącznie `package`, Then istniejąca rezerwacja i jej `price_snapshot` pozostają nietknięte.
- AC2: Given zmiana wchodzi w życie, When kolejny klient próbuje zarezerwować ten typ grupy, Then stosowana jest nowa polityka.

**US-23.6** Jako administrator, chcę zmienić `allowed_purchase_modes`/`allowed_billing_types` bez wpływu na klientów, którzy już kupili — w tym tych z aktywną subskrypcją.
- AC1: Given klient ma aktywną subskrypcję, When administrator usuwa `recurring` z `allowed_billing_types` tego typu grupy, Then subskrypcja nadal odnawia się normalnie.
- AC2: Given administrator zapisuje zmianę polityki, When nowy klient (jeszcze bez żadnego zakupu tego typu grupy) otwiera formularz rejestracji, Then widzi wyłącznie tryby/rozliczenia zgodne z nową, aktualną polityką.
- AC3: Given istnieje `product_template` z `billing_type` niezgodnym z nową polityką (utworzony przed zmianą, nadal `is_active=true`), When jakikolwiek klient bez wcześniej aktywnego zakupu tego typu próbuje go kupić, Then zakup jest blokowany.
- AC4: Given klient z aktywną subskrypcją anuluje ją, When później chce ponownie zasubskrybować ten sam typ grupy, Then jest to traktowane jako nowy zakup podlegający polityce aktualnej w tym momencie.
- AC5: Given zmiana polityki na typie grupy, When sprawdzam stan `product_template` powiązanych z tym typem, Then żaden z nich nie jest automatycznie dezaktywowany przez samą zmianę polityki.
- AC6: Given administrator zawęża `allowed_purchase_modes`, When klient ma w toku rezerwację `payment_pending` opartą o starą politykę, Then ta rezerwacja i jej link płatności pozostają ważne i finalizują się normalnie.

### EPIK 24 — Waluta i kwoty pieniężne

**US-24.1** Jako administrator, chcę zdefiniować walutę mojej akademii raz, aby wszystkie ceny i płatności były w niej spójnie wyrażane.
- AC1: Given tworzę `organization`, When nie podaję `currency`, Then system odrzuca zapis (pole wymagane, brak wartości domyślnej dorozumianej).
- AC2: Given `organization.currency = PLN`, When tworzę `group_type` z ceną, Then Stripe Checkout jest inicjowany w PLN bez dodatkowej konfiguracji.

**US-24.2** Jako klient, chcę mieć pewność, że moja zamrożona cena nie zmieni waluty, nawet jeśli akademia kiedyś zmieni swoją walutę rozliczeniową.
- AC1: Given rezerwuję zajęcia przy `organization.currency = PLN`, When admin później zmienia walutę organizacji na EUR, Then moje istniejące `booking.price_snapshot` zachowuje zapisaną walutę PLN, nie jest przeliczane.

### EPIK 25 — Nieudana płatność subskrypcyjna

**US-25.1** Jako system, chcę odzwierciedlić stan nieudanej płatności subskrypcyjnej bez wpływu na już wygenerowane kredyty.
- AC1: Given aktywna subskrypcja, When otrzymywany jest webhook `invoice.payment_failed`, Then `credit_purchase.subscription_status → past_due`; żadne wcześniej wygenerowane, dostępne kredyty NIE są cofane ani blokowane.
- AC2: Given `subscription_status = past_due`, When kolejny cykl rozliczeniowy nie generuje `invoice.paid`, Then żadne nowe kredyty nie powstają w tym cyklu.
- AC3: Given webhook `customer.subscription.deleted` (ostateczne anulowanie po wyczerpaniu prób Stripe), When system go przetwarza, Then `subscription_status → canceled`; istniejące, niewygasłe kredyty pozostają `available` do naturalnego `valid_until`.

**US-25.2** Jako klient, chcę być poinformowany, gdy moja płatność subskrypcyjna się nie powiedzie, z jasną ścieżką naprawy.
- AC1: Given webhook `invoice.payment_failed` jest przetworzony, When zdarzenie następuje, Then generowane jest powiadomienie zawierające link do Stripe Customer Portal.
- AC2: Given klient aktualizuje metodę płatności przez Customer Portal i płatność się powodzi, When Stripe wysyła kolejny `invoice.paid`, Then `subscription_status → active`, a auto-wypełnienie terminów jest wykonywane normalnie dla tego cyklu.

**US-25.3** Jako administrator, chcę widzieć status płatności subskrypcji klienta bez odpytywania Stripe ręcznie.
- AC1: Given przeglądam profil klienta, When sprawdzam jego aktywne zakupy, Then widzę `subscription_status` każdej subskrypcji zdenormalizowany lokalnie, bez wywołania do Stripe API.

### EPIK 26 — Notification Center (dedykowana encja domenowa)

**US-26.1** Jako klient, chcę wybrać, którym kanałem chcę być informowany o zdarzeniach dotyczących moich rezerwacji.
- AC1: Given otwieram ustawienia powiadomień, When zmieniam preferencję dla `credit_expiring_soon` na wyłącznie e-mail, Then kolejne zdarzenia tego typu nie generują wpisu in-app, tylko e-mail.
- AC2: Given próbuję wyłączyć oba kanały dla `refund_confirmed`, When zapisuję preferencję, Then system odrzuca zmianę — to zdarzenie ma `is_overridable=false`.

**US-26.2** Jako system, chcę generować powiadomienie z jednego, spójnego punktu przy każdym zdarzeniu biznesowym, zamiast rozproszonej logiki wysyłkowej.
- AC1: Given dowolne zdarzenie z tabeli mapowania w §2.16 następuje, When jest przetwarzane, Then tworzony jest dokładnie jeden rekord `notification` na odbiorcę.
- AC2: Given zdarzenie dotyczy wielu odbiorców jednocześnie, When jest przetwarzane, Then każdy odbiorca otrzymuje osobny rekord `notification`, wysyłane w ramach tej samej operacji.

**US-26.3** Jako klient, chcę widzieć nieprzeczytane powiadomienia w panelu, z licznikiem.
- AC1: Given mam 3 nieprzeczytane powiadomienia, When otwieram panel, Then widzę licznik „3" i listę, z możliwością oznaczenia pojedynczo lub zbiorczo jako przeczytane.

### EPIK 27 — Faktury i dokumenty sprzedaży, proces ręczny

**US-27.1** Jako klient, chcę móc poprosić o fakturę do mojego zakupu.
- AC1: Given mam zakończony `credit_purchase`, When zgłaszam chęć otrzymania faktury, Then `invoice_requested_at` jest ustawiane, a zgłoszenie trafia na listę widoczną dla recepcji/admina.

**US-27.2** Jako recepcja, chcę widzieć listę zakupów oczekujących na wystawienie faktury i odznaczyć je po wystawieniu ręcznym.
- AC1: Given lista zakupów z `invoice_requested_at IS NOT NULL AND invoice_issued_at IS NULL`, When przeglądam ją, Then widzę dane klienta i kwotę potrzebną do ręcznego wystawienia faktury.
- AC2: Given wystawiłem fakturę ręcznie poza systemem, When oznaczam zakup jako rozliczony i wpisuję numer faktury, Then `invoice_issued_at`, `invoice_number`, `invoice_issued_by_user_id` są zapisywane.
- AC3: Given próbuję oznaczyć fakturę jako wystawioną bez wcześniejszego `invoice_requested_at`, When zapisuję, Then system i tak na to pozwala.

**US-27.3** Jako administrator, chcę mieć pewność, że brak automatycznego fakturowania nie blokuje standardowej sprzedaży online.
- AC1: Given klient płaci online za pojedyncze zajęcia lub pakiet, When płatność się powodzi, Then rezerwacja/kredyty są tworzone normalnie, niezależnie od tego, czy klient kiedykolwiek poprosi o fakturę.

### EPIK 28 — Regulaminy i akceptacje

**US-28.1** Jako administrator, chcę przypisać regulamin do typu grupy przy jego tworzeniu.
- AC1: Given tworzę/edytuję `group_type`, When wskazuję `policy_document_id`, Then wskazany dokument jest wiązany z typem grupy i widoczny klientowi przy zapisie.
- AC2: Given `group_type` nie ma przypisanego regulaminu, When klient przechodzi formularz rejestracji, Then krok akceptacji regulaminu jest pomijany.

**US-28.2** Jako klient, chcę zaakceptować obowiązujący regulamin przy zapisie na zajęcia i mieć pewność, że ta konkretna wersja jest zapamiętana.
- AC1: Given `group_type` ma przypisany `policy_document`, When wypełniam formularz rejestracji, Then muszę zaznaczyć akceptację regulaminu przed finalizacją zapisu.
- AC2: Given akceptuję regulamin, When zapis jest finalizowany, Then tworzony jest `policy_acceptance` z zamrożoną `policy_document_version`.

**US-28.3** Jako administrator, chcę zmienić treść regulaminu bez wpływu na już złożone akceptacje.
- AC1: Given edytuję treść `policy_document` (nowy plik), When zapisuję zmianę, Then powstaje nowy rekord/wersja — istniejące `policy_acceptance` nadal wskazują starą wersję i pozostają niezmienione.
- AC2: Given klient z akceptacją starszej wersji wraca i dopisuje się na kolejny termin tego samego `group_type`, When `policy_document.version` różni się od wersji jego ostatniej akceptacji dla tego `group_type`, Then system wymusza ponowną akceptację przed finalizacją — decyzja wymaga potwierdzenia prawnego przed wdrożeniem.

**US-28.4** Jako administrator, chcę zobaczyć, jaki dokładnie regulamin obowiązywał klienta w danym momencie, na potrzeby sporu/reklamacji.
- AC1: Given przeglądam profil klienta, When sprawdzam historię akceptacji, Then widzę listę `policy_acceptance` z linkiem do dokładnie tej wersji pliku, którą klient zaakceptował.

### EPIK 29 — Limity Planu i Feature Gating (v13)

**US-29.1** Jako Super Admin, chcę definiować plany z limitami liczbowymi bez udziału developerów.
- AC1: Given tworzę `plan_limit_definition` dla planu „Basic" z `limit_key=max_students`, `limit_value=25`, When zapisuję, Then limit obowiązuje natychmiast dla wszystkich organizacji na planie Basic, bez wdrożenia kodu.
- AC2: Given zmieniam `limit_value` z 25 na 30, When zapisuję, Then organizacje wcześniej blokowane przy 26–30 uczniach mogą natychmiast dodawać kolejnych.
- AC3: Given zostawiam `limit_value` puste (NULL), When system to interpretuje, Then oznacza to brak limitu — jawnie, nie przez brak rekordu.

**US-29.2** Jako administrator akademii, chcę być zablokowany przy próbie przekroczenia limitu planu, z jasną informacją co dalej.
- AC1: Given organizacja ma plan z `max_students=25` i już 25 uczniów, When admin próbuje dodać 26., Then operacja jest odrzucana z komunikatem wskazującym limit, zużycie i CTA „Przejdź na wyższy plan".
- AC2: Given powyższe, When sprawdzenie jest wykonywane, Then jest wykonywane na backendzie niezależnie od UI.
- AC3: Given brak zdefiniowanego `limit_key` dla planu organizacji, When admin próbuje dodać zasób tego typu, Then operacja jest blokowana (fail-closed).

**US-29.3** Jako Owner organizacji, chcę wiedzieć, że zbliżam się do limitu, zanim zostanę zablokowany.
- AC1: Given zużycie limitu osiąga próg 90% (konfigurowalny), When próg jest przekraczany, Then generowane jest powiadomienie `plan_limit_approaching` (Notification Center, §2.16, `recipient_type=staff`).
- AC2: Given limit zostaje osiągnięty (100%) i kolejna próba jest blokowana, When to następuje, Then generowane jest osobne powiadomienie `plan_limit_reached`, jednorazowo per przekroczenie — nie przy każdej kolejnej odrzuconej próbie.

**US-29.4** Jako Super Admin, chcę wynegocjować niestandardowe limity dla pojedynczej organizacji bez tworzenia dla niej osobnego planu.
- AC1: Given organizacja X jest na planie „Pro" (`max_students=100`), When tworzę `organization_limit_override` (X, `max_students`, 150), Then efektywny limit dla X wynosi 150, a pozostałe organizacje na Pro nadal mają 100.
- AC2: Given override istnieje, When plan organizacji jest później zmieniany, Then override pozostaje w mocy niezależnie od nowego planu, dopóki Super Admin go jawnie nie usunie.

**US-29.5** Jako klient, chcę widzieć, które funkcje są dostępne w moim planie, a które wymagają upgrade'u.
- AC1: Given `plan_feature_flag.subscriptions_enabled=false` dla planu organizacji, When admin próbuje utworzyć `product_template` z `billing_type=recurring`, Then operacja jest blokowana z komunikatem o wymaganym planie — niezależnie od tego, czy `allowed_billing_types` na `group_type` dopuszcza `recurring` (§EPIK 23).
- AC2: Given funkcja niedostępna w planie, When admin przegląda odpowiednią sekcję UI, Then widzi ją oznaczoną „wymaga planu X" z linkiem do upgrade'u, zamiast całkowitego ukrycia.

**US-29.6** Jako administrator platformy, chcę mieć pewność, że downgrade nie niszczy danych klienta.
- AC1: Given organizacja ma 35 aktywnych uczniów, When przechodzi na plan z `max_students=25`, Then żaden z 35 rekordów `athlete` nie jest usuwany ani dezaktywowany automatycznie.
- AC2: Given stan 35/25, When admin próbuje dodać 36. ucznia, Then operacja jest blokowana jak przy zwykłym osiągnięciu limitu.
- AC3: Given downgrade się powiódł i organizacja przekracza nowy limit, When operacja się kończy, Then Owner/Admin otrzymuje powiadomienie z listą przekroczonych limitów.

**US-29.7** Jako Super Admin, chcę mieć pewność, że każda zmiana konfiguracji planu jest audytowalna.
- AC1: Given zmieniam `limit_value` lub `is_enabled` na dowolnym `plan_limit_definition`/`plan_feature_flag`, When zapisuję, Then wpis trafia do audit trail (boilerplate §6.4) z wykonawcą `SuperAdmin`, starą i nową wartością.

### EPIK 30 — Stripe Connect i konfiguracja płatności per organizacja (v14)

**US-30.1** Jako Owner akademii, chcę połączyć własne konto Stripe z panelu, aby móc przyjmować płatności online od moich klientów.
- AC1: Given jestem zalogowany jako Owner i `organization.stripe_connect_status = not_connected`, When wchodzę w sekcję „Płatności", Then widzę przycisk „Połącz Stripe" i informację, że bez połączenia płatności online są niedostępne (płatność na miejscu działa już teraz).
- AC2: Given klikam „Połącz Stripe", When system inicjuje przepływ, Then jestem przekierowany do Stripe w celu założenia lub podłączenia istniejącego konta (Standard Connect).
- AC3: Given wracam ze Stripe po autoryzacji, When backend odbiera kod, Then `organization.stripe_connect_account_id` jest zapisywane, a `stripe_connect_status` ustawiane na `onboarding_incomplete` do czasu potwierdzenia przez webhook.
- AC4: Given Stripe wysyła webhook `account.updated` z `charges_enabled=true`, When system go przetwarza, Then `stripe_connect_status → active` i `stripe_connect_connected_at` jest ustawiane.

**US-30.2** Jako administrator akademii, nie chcę móc przypadkiem włączyć płatności online, zanim Stripe nie zostanie w pełni skonfigurowany.
- AC1: Given `organization.stripe_connect_status != active`, When próbuję ustawić `group_type.payment_policy` na zawierające „online", Then opcja jest zablokowana w UI z komunikatem i CTA do §US-30.1.
- AC2: Given powyższe, When próbuję to samo bezpośrednio przez API, Then backend odrzuca zapis niezależnie od UI.
- AC3: Given `stripe_connect_status != active`, When klient akademii próbuje zapłacić online za zajęcia, Then Checkout nie jest generowany — backend jest ostatecznym źródłem prawdy, nie tylko UI.
- AC4: Given `stripe_connect_status != active`, When klient akademii wybiera „Płacę na miejscu", Then rezerwacja przebiega normalnie — brak Stripe Connect nie blokuje płatności gotówkowych.

**US-30.3** Jako Owner, chcę wiedzieć, gdy moje konto Stripe wymaga uwagi, zanim moi klienci zaczną mieć problemy z płatnością.
- AC1: Given Stripe oznacza konto jako `restricted` (webhook `account.updated`), When system go przetwarza, Then `organization.stripe_connect_status → restricted`, generowane jest powiadomienie `stripe_connect_requires_attention` (Notification Center, `recipient_type=staff`), a nowe płatności online są ponownie blokowane jak w US-30.2.
- AC2: Given konto jest `restricted`, When sprawdzam już istniejące, aktywne subskrypcje/rezerwacje na Connected Account, Then nie są one przerywane przez samą zmianę statusu — dotyczy wyłącznie nowych checkoutów inicjowanych przez langlion.
- AC3: Given wchodzę do panelu Ownera w dowolnym momencie, When sprawdzam sekcję „Płatności", Then widzę aktualny status Connect (aktywne/wymaga uwagi/niepołączone) niezależnie od tego, czy przeczytałem powiadomienie.

**US-30.4** Jako system, chcę mieć pewność, że płatności za plan platformy i płatności klientów akademii nigdy się nie mieszają.
- AC1: Given organizacja ma zarówno `platform_stripe_customer_id` (opłata za plan), jak i `stripe_connect_account_id` (płatności klientów), When generowany jest dowolny PaymentIntent/Subscription, Then system jawnie wskazuje, które z dwóch kont Stripe jest celem operacji — checkout za plan zawsze na koncie platformy, checkout za zajęcia/pakiety zawsze na Connected Account organizacji.
- AC2: Given webhook dociera od Stripe, When system go przetwarza, Then rozróżnia, czy dotyczy konta platformy (np. `customer.subscription.updated` dla planu, §EPIK 29) czy Connected Account (np. `account.updated`, `charge.refunded` dla zakupów klientów) i kieruje go do odpowiedniej logiki.

**US-30.5** Jako Owner, chcę mieć wyłączne prawo do podłączania/odłączania konta Stripe mojej akademii.
- AC1: Given jestem Adminem (nie Ownerem), When próbuję wejść w opcję połączenia/odłączenia Stripe, Then nie mam do tego dostępu — wymagane jest uprawnienie `billing_connect.manage`, przypisane wyłącznie do roli Owner.
- AC2: Given próba dostępu następuje bezpośrednio przez API z konta bez uprawnienia, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI.

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

### EPIK 32 — Wynagrodzenia trenerów, wyłącznie informacyjne (v15)

**US-32.1** Jako administrator, chcę zdefiniować stawkę trenera, aby móc raportować należne wynagrodzenie.
- AC1: Given mam uprawnienie `trainer_rates.manage`, When tworzę `trainer_rate` dla trenera bez wskazania `group_type_id`, Then powstaje jego stawka bazowa obowiązująca we wszystkich typach grup.
- AC2: Given trener ma stawkę bazową, When tworzę dodatkowy `trainer_rate` dla konkretnego `group_type_id`, Then dla sesji tego typu obowiązuje stawka nadpisująca, a dla pozostałych — bazowa (Constraint 8).
- AC3: Given jestem trenerem, When próbuję utworzyć lub zmienić jakąkolwiek stawkę, Then operacja jest odrzucana — `trainer_rates.manage` mają wyłącznie Owner i Admin.
- AC4: Given `amount` jest zapisywane, When sprawdzam jego interpretację, Then jest to ryczałt za poprowadzoną sesję w najmniejszej jednostce waluty (§2.14), niezależny od liczby uczestników i długości zajęć.

**US-32.2** Jako administrator, chcę podnieść stawkę trenera bez zmiany rozliczenia minionych miesięcy.
- AC1: Given trener ma stawkę 100 zł z `effective_from = 2026-01-01`, When ustalam nową stawkę 120 zł od `2026-09-01`, Then powstaje nowy rekord `trainer_rate`, a poprzedni pozostaje nietknięty.
- AC2: Given powyższe, When generuję raport za sierpień 2026, Then sesje są liczone po 100 zł; raport za wrzesień liczy je po 120 zł.
- AC3: Given raport za miniony okres został już wygenerowany i podniesiono stawkę, When generuję go ponownie, Then wynik jest identyczny jak poprzednio — zmiana stawki nie działa wstecz.

**US-32.3** Jako administrator, chcę zobaczyć zestawienie należnych wynagrodzeń za wybrany okres.
- AC1: Given wybieram trenera i zakres dat, When generuję raport, Then suma obejmuje wyłącznie sesje, w których ten trener był prowadzącym ORAZ co najmniej jedna powiązana `booking` ma `attendance_status != 'unmarked'`.
- AC2: Given sesja odbyła się w okresie, ale nikt nie oznaczył na niej obecności, When raport jest generowany, Then ta sesja NIE jest liczona.
- AC3: Given na sesji wszyscy uczestnicy zostali oznaczeni jako `absent`, When raport jest generowany, Then sesja JEST liczona — prowadzący pojawił się i sprawdził listę, więc stawka mu przysługuje.
- AC4: Given sesja kwalifikuje się wg AC1, ale Constraint 8 nie rozstrzyga dla niej żadnej stawki, When raport jest generowany, Then sesja trafia na **wyodrębnioną listę „brak stawki"** widoczną dla admina i NIE jest liczona jako zero ani pomijana bez śladu.

**US-32.4** Jako trener, chcę widzieć własne zestawienie, ale nie cudze.
- AC1: Given mam uprawnienie `trainer_earnings.view` jako trener, When otwieram raport, Then widzę wyłącznie własne sesje i własne kwoty.
- AC2: Given próbuję pobrać dane innego trenera bezpośrednio przez API, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI.
- AC3: Given jestem Ownerem lub Adminem, When otwieram raport, Then widzę dane wszystkich trenerów organizacji.

**US-32.5** Jako właściciel platformy, chcę mieć pewność, że moduł wynagrodzeń nie wywołuje żadnych skutków finansowych.
- AC1: Given raport został wygenerowany dla dowolnego okresu i kwoty, When sprawdzam skutki, Then nie powstaje żadna płatność, wypłata ani transfer.
- AC2: Given powyższe, When sprawdzam oba konta Stripe (Platform Billing oraz Connected Account akademii, Zasada nadrzędna #7), Then żadne z nich nie odnotowuje jakiejkolwiek operacji wywołanej tym raportem.
- AC3: Given trener ma wyliczone wynagrodzenie, When szukam ścieżki jego wypłaty w systemie, Then taka ścieżka nie istnieje — rozliczenie odbywa się poza systemem.

### EPIK 33 — Indywidualne ceny klienta (v15)

**US-33.1** Jako administrator, chcę przyznać wynegocjowany rabat konkretnemu klientowi.
- AC1: Given rozmawiałem z klientem poza systemem i mam uprawnienie `client_price_override.manage`, When przyznaję rabat z profilu tego klienta, Then powstaje `client_price_override` z `granted_by_user_id` i datami obowiązywania.
- AC2: Given wypełniam formularz rabatu bez podania `reason`, When zapisuję, Then system odrzuca zapis — powód jest wymagany, analogicznie do `credits.manual_grant` (§US-7.3).
- AC3: Given rabat został przyznany, When sprawdzam audit trail, Then widoczne jest kto, komu, jaki typ i wartość, jaki zasięg, na jaki okres i z jakim powodem.
- AC4: Given nie mam uprawnienia `client_price_override.manage`, When wysyłam żądanie bezpośrednio przez API, Then jest odrzucane niezależnie od UI.

**US-33.2** Jako administrator, chcę zdecydować, czy rabat dotyczy jednej oferty, czy całej akademii.
- AC1: Given tworzę override ze wskazanym `group_type_id`, When klient kupuje inną ofertę, Then płaci cenę katalogową.
- AC2: Given tworzę override bez `group_type_id` (NULL), When klient kupuje dowolną ofertę akademii, Then rabat obowiązuje wszędzie.
- AC3: Given klient A ma rabat na daną ofertę, When klient B zapisuje się na tę samą ofertę, Then widzi i płaci cenę katalogową — rabat nie jest ofertą grupy, tylko ustaleniem indywidualnym.
- AC4: Given istnieje zarówno override dla `(client_id, group_type_id)`, jak i dla `(client_id, NULL)`, When wyliczana jest cena tej konkretnej oferty, Then wygrywa override wskazujący `group_type_id` (Constraint 9).

**US-33.3** Jako klient z przyznanym rabatem, chcę zapłacić obniżoną cenę za pojedyncze zajęcia.
- AC1: Given mam aktywny override `percent_discount` = 20, a `group_type.price` = 100 zł, When rezerwuję zajęcia, Then płacę 80 zł.
- AC2: Given mam aktywny override `fixed_price` = 60 zł, When rezerwuję zajęcia z ceną katalogową 100 zł, Then płacę 60 zł niezależnie od ceny katalogowej.
- AC3: Given nie mam żadnego pasującego, aktywnego override, When rezerwuję zajęcia, Then płacę cenę katalogową — brak rabatu nigdy nie blokuje zakupu (fail-open, Constraint 9).
- AC4: Given rezerwacja została utworzona z rabatem, When sprawdzam `booking.price_snapshot`, Then zamrożona jest cena PO rabacie wraz z walutą (§2.14).
- AC5: Given moja rezerwacja ma zamrożony `price_snapshot`, When admin później zmienia lub wyłącza mój rabat, Then ta rezerwacja pozostaje nietknięta (Zasada nadrzędna #1).

**US-33.4** Jako klient z przyznanym rabatem, chcę kupić pakiet w obniżonej cenie.
- AC1: Given mam aktywny override pasujący do typu grupy powiązanego z pakietem, When kupuję `product_template` jednorazowo, Then `credit_purchase.price_paid` zapisuje kwotę po rabacie.
- AC2: Given kupiłem pakiet z rabatem i wnioskuję o zwrot, When wyliczana jest kwota zwrotu (§2.9), Then formuła `(niewykorzystane / zakupione) × price_paid` operuje na kwocie faktycznie zapłaconej, nie katalogowej.
- AC3: Given liczba wygenerowanych kredytów zależy od `credit_quantity`, When kupuję pakiet z rabatem, Then otrzymuję tę samą liczbę kredytów co bez rabatu — rabat zmienia wyłącznie cenę, nigdy zawartość pakietu.

**US-33.5** Jako klient z subskrypcją i rabatem, chcę, aby rabat obowiązywał w kolejnych cyklach, dopóki jest ważny.
- AC1: Given mam aktywną subskrypcję i aktywny override, When następuje odnowienie (`invoice.paid`, §2.15), Then naliczana kwota uwzględnia stan override'a **w momencie tego odnowienia**, nie w momencie założenia subskrypcji.
- AC2: Given admin zmienia wartość mojego rabatu między cyklami, When następuje kolejne odnowienie, Then nowa kwota jest naliczana zgodnie ze zmienioną wartością — zmienna cena między cyklami jest zachowaniem oczekiwanym, nie błędem.
- AC3: Given mój override ma `valid_until` w przeszłości względem momentu odnowienia, When następuje odnowienie, Then naliczana jest pełna cena katalogowa, bez żadnej akcji admina.
- AC4: Given rabat wygasł i naliczono pełną cenę, When sprawdzam swoją skrzynkę i Notification Center, Then NIE otrzymuję powiadomienia o wygaśnięciu rabatu — świadomie pominięte na tym etapie (§6).
- AC5: Given rabat wygasł lub został wyłączony, When sprawdzam już wygenerowane kredyty z poprzednich cykli, Then pozostają nietknięte i ważne do swojego `valid_until`.

**US-33.6** Jako administrator, chcę wycofać rabat bez naruszania historii.
- AC1: Given ustawiam `is_active=false` na istniejącym override, When klient dokonuje kolejnego zakupu, Then płaci cenę katalogową.
- AC2: Given override ma `valid_until` w przeszłości, When klient dokonuje zakupu, Then efekt jest identyczny jak przy `is_active=false` — oba mechanizmy działają tak samo, od następnego zakupu.
- AC3: Given wyłączam rabat, When sprawdzam wcześniejsze `booking.price_snapshot` i `credit_purchase.price_paid` tego klienta, Then pozostają niezmienione.

**US-33.7** Jako właściciel platformy, chcę mieć pewność, że rabat nigdy nie jest samoobsługowy.
- AC1: Given jestem klientem, When przeglądam panel i formularz rejestracji, Then nie istnieje żadna ścieżka UI ani API pozwalająca mi zgłosić wniosek o rabat, wpisać kod promocyjny ani samodzielnie zastosować zniżkę.
- AC2: Given mam przyznany rabat, When dokonuję zakupu, Then stosuje się on automatycznie do każdego pasującego zakupu, bez żadnej akcji z mojej strony.
- AC3: Given admin przyznał mi rabat, When sprawdzam, od kiedy obowiązuje, Then obowiązuje na wszystkie kolejne rozpoznania mojego konta (kolejny zapis, dopisanie następnego dziecka, nowy sezon), a nie wyłącznie na najbliższy zakup — aż do wygaśnięcia lub wyłączenia (§2.31).

---

## 4. Tabela porównawcza: płatność online vs na miejscu

| Cecha | Płatność online | Płatność na miejscu |
|---|---|---|
| Status startowy | `payment_pending` | `booked_offline` |
| Weryfikacja płatności | automatyczna (webhook) | ręczna (recepcja/admin/trener) |
| Gwarancja miejsca | po opłaceniu | od razu, ale wymaga pilnowania listy (brak automatycznego timeoutu) |
| Rola kredytu | generowany i konsumowany atomowo (`online_payment`) | generowany i konsumowany po ręcznym zatwierdzeniu (`on_site_payment`) |
| Co widzi trener | zielony „Opłacone" | żółty „Do zapłaty" |
| No-show | bez konsekwencji (na razie) | bez konsekwencji (na razie) |

Obie ścieżki są symetryczne pod względem roli kredytu — różnią się wyłącznie momentem i sposobem potwierdzenia płatności. Fakturowanie (§2.17) jest procesem ręcznym niezależnym od tej tabeli.

---

## 5. Kolejność implementacji (rekomendowana)

1. Rozstrzygnięcie mapowania tożsamości boilerplate (§2.19) — decyzja architektoniczna, musi zapaść przed pisaniem RBAC. **Rozstrzygnięte (rewizja 14.1):** personel = boilerplate User+Membership; klient = domenowa encja `client` z OTP per organizacja.
2. Model danych fundamentalny: `organization` (z `currency`), `location`, `group_type`, `group_type_recurrence`, `session` + wszystkie 3 ochrony race condition (§5.1–§5.3) — kwoty od razu jako liczby całkowite, taniej teraz niż po migracji danych produkcyjnych.
3. Silnik Schedule-First + generowanie sesji jako efekt zapisu wzorca, z dziedziczeniem lokalizacji. Razem z tym punktem wchodzi `group_type.description` (v15) — prosta kolumna prezentacyjna, tania teraz, bo formularz CRUD typu grupy i tak powstaje.
4. Ścieżka klienta: formularz + upsert + OTP (domenowy, encja `client` — rewizja 14.1), start z płatnością na miejscu (bez integracji bramki).
5. System kredytowy: `credit_type`, `credit`, FIFO + atomowa konsumpcja — równolegle z punktem 4.
6. Panel trenera/recepcji: widoczność statusów + zatwierdzanie płatności na miejscu. Razem z tym punktem wchodzi **potwierdzanie obecności (EPIK 31, v15)** — ta sama lista uczestników sesji jest nośnikiem obu funkcji.
   **6a. Raport wynagrodzeń trenerów (EPIK 32, v15)** — zależny od punktu 6, ponieważ kwalifikacja sesji do raportu opiera się na danych frekwencyjnych (§2.30). Bez oznaczeń obecności raport nie ma na czym pracować.
7. Soft delete dla `group_type`, trenera, `credit_type`, `location` — tanio teraz, drogo później.
8. Płatność online (Stripe) jako rozszerzenie, przez adapter billingowy boilerplate'u — nie osobna integracja.
   **8a. Model planów i limitów (EPIK 29, v13)** — musi istnieć przed publicznym uruchomieniem, ponieważ bez niego brak mechanizmu ograniczającego użycie darmowego/niższego planu. Wymaga gotowego adaptera billingowego z punktu 8.
   **8b. Stripe Connect per organizacja (EPIK 30, v14)** — musi istnieć przed dopuszczeniem jakiejkolwiek akademii do przyjmowania płatności online od swoich klientów (punkt 9 poniżej blokuje się na tym warunku per organizacja, nie globalnie). Rozszerza ten sam adapter billingowy z punktu 8, ale operuje na odrębnej tożsamości Stripe (Connected Account) niż Platform Billing z punktu 8a — patrz Zasada nadrzędna #7.
9. Zakupy: `product_template` + pakiety jednorazowe → subskrypcje → auto-wypełnienie terminów (§7.5a); `allowed_purchase_modes`/`allowed_billing_types` wdrażane razem z tym punktem, przed publicznym uruchomieniem rejestracji z zakupem pakietów; obsługa `invoice.payment_failed` i `subscription_status` razem z tym punktem, przed publicznym uruchomieniem subskrypcji.
    **9a. Indywidualne ceny klienta (EPIK 33, v15)** — po punkcie 9, ponieważ rabat obejmuje nie tylko `group_type.price`, ale też `product_template.price`, w tym subskrypcje. Przed startem tego punktu musi zapaść decyzja o mechanice Stripe dla rabatu na subskrypcji (§8, otwarty punkt).
10. Anulowanie + odrabianie (Proces A), w tym anulowanie administracyjne zwalniające miejsce.
11. Widoczność portfela kredytów w UI.
12. Notification Center jako dedykowana encja (§2.16) — zamiast generycznego mechanizmu z boilerplate §23, rozszerzone o zdarzenie zmiany lokalizacji, nieudanej płatności **i limitów planu (v13)**.
13. Proces B: Zmiana Grupy + przeniesienie kredytu między dziećmi.
14. Zwroty fiducjarne (po konsultacji prawnej — prawo konsumenckie).
15. Regulaminy i akceptacje (§2.18) — musi być gotowe przed pierwszym publicznym zapisem klienta, jeśli akademia wymaga akceptacji regulaminu prawnie.
16. Silniki Availability-First i Slot-First.
17. Force Override + audit trail (wyłącznie konflikt trenera) — wykorzystujący wspólny hook boilerplate §6.4.
18. Warunkowe UI formularza rejestracji odzwierciedlające `allowed_purchase_modes` — ostatni krok, zależny od punktu 9.
19. Proces ręcznego fakturowania (§2.17) — czysto administracyjny, niski priorytet, nie blokuje ścieżki zakupowej klienta.

---

## 6. Odłożone poza MVP

- Pełny, uniwersalny byt `client_request` obsługujący wiele typów wniosków jedną wspólną kolejką/audit trailem. Świadomie odłożone — nie zapomniane. Na MVP Zmiana Grupy dostała własny, dedykowany model `group_change_request` (§1.2, §EPIK 11) — to nie jest już obejście przez przeciążenie `booking.payment_status`, tylko pełnoprawny byt z własnym cyklem stanów. Odłożone pozostaje wyłącznie uogólnienie tego mechanizmu na inne typy wniosków: przeniesienie kredytu między dziećmi (§7.1a) — na MVP zostaje jako prostsza, osobna ścieżka zatwierdzenia; wspólna tabela nadrzędna (`client_request`) łącząca oba typy w jedną kolejkę UI dla admina.
- Agregacja powiadomień (Notification Batching) dla operacji masowych. Świadomie odłożone — na MVP każda operacja masowa wysyła powiadomienia zgodnie z już istniejącymi regułami per zdarzenie (§2.16), bez agregacji w jeden zbiorczy digest.
- Automatyczne fakturowanie/Stripe Tax (§2.17) — świadomie odłożone poza MVP na rzecz procesu ręcznego.
- **Utrzymywany licznik zużycia (zamiast liczenia na żywo) dla limitów planu (v13)** — optymalizacja wydajności, odłożona do momentu, gdy realna skala organizacji (liczba uczniów/grup) uzasadni koszt dodatkowej infrastruktury.
- **Automatyczne wymuszanie zgodności z limitem przy downgrade (v13)** — np. blokada samego downgrade'u zamiast tylko nowych operacji — świadomie uproszczone na MVP do modelu „miękkiej" blokady.
- **Express Connect jako alternatywa dla Standard (v14)** — szybszy, bardziej prowadzony onboarding dla mniejszych/mniej technicznych akademii, kosztem większej odpowiedzialności platformy (obsługa części sporów, wsparcia). Odłożone — Standard wystarcza na start, patrz §7 decyzja.
- **Powiadomienie o wygasającym rabacie klienta (v15)** — nowe zdarzenie w Notification Center (np. `client_discount_expiring`), informujące klienta, że jego indywidualna cena zaraz przestanie obowiązywać. Świadomie pominięte: rabat wygasa cicho, a pierwsze odnowienie po `valid_until` nalicza cenę katalogową bez uprzedzenia (§2.31, US-33.5/AC4). Odnotowane jako możliwe rozszerzenie — **nie projektowane teraz**.
- **UI raportów i analityki frekwencji oraz rentowności (v15)** — EPIK 31 dostarcza surowe dane frekwencyjne, ale ich zagregowana prezentacja (trendy obecności, rentowność grupy) pozostaje poza zakresem. To brak UI, nie brak danych.
- **Panel klienta z historią płatności (v15)** — dane (`credit_purchase`, `booking.price_snapshot`) już istnieją w modelu; brakuje wyłącznie widoku. Do zrobienia później.
- **Automatyczna opłata platformowa (`application_fee`) potrącana z każdej transakcji Connect (v14)** — model prowizji platformy od sprzedaży akademii. Świadomie poza MVP — na start langlion rozliczany jest wyłącznie przez opłatę za plan (§EPIK 29), nie prowizję transakcyjną; patrz §8 otwarte punkty.

---

## 7. Rozstrzygnięte decyzje

Poniższe punkty były otwarte we wcześniejszych wersjach — rozstrzygnięte, dokument już to odzwierciedla w odpowiednich sekcjach:

| # | Punkt | Decyzja |
|---|---|---|
| 1 | Charakter flagi `is_new_client_only` (§US-4.3) | Zostawiamy bez zmian — flaga działa jak dziś opisano, bez dodatkowej logiki ochronnej. |
| 2 | Weryfikacja podpisu webhooków Stripe | Potwierdzona — pokryta w głównym boilerplacie platformy. |
| 3 | Dokładna wartość `group_change_request.expires_at` (US-11.3/AC1) | 24h — decyzja zamknięta. |
| 4 | Zapis częściowego postępu w „Kreatorze Reasygnacji" trenera (US-21.1) | Nie — brak stanu pośredniego do zapisania; dezaktywacja to bramka licząca aktualny stan na żądanie. |
| 5 | Czy zmiana `allowed_purchase_modes`/`allowed_billing_types` wpływa na aktywne subskrypcje | Nie — nieretroaktywność w pełni, patrz §2.13 i §US-23.6. Subskrypcja żyje własnym cyklem odnowień niezależnie od późniejszej zmiany polityki grupy. |
| 6 | Czy dezaktywacja lokalizacji blokuje twardo jak trener/`group_type` | Nie — wyłącznie ostrzeżenie (toast z listą kolizji), bo lokalizacja jest atrybutem informacyjnym, nie zależnością krytyczną silnika rezerwacji. |
| 7 | Czy wdrażać automatyczne fakturowanie (Stripe Tax/Invoicing) w MVP | Nie — proces ręczny (§2.17); system tylko odnotowuje żądanie/wystawienie faktury. |
| 8 | Czy Notification Center reużywa generycznego mechanizmu z boilerplate §23 | Nie — dedykowana encja domenowa (§2.16), jedyny (do v12) świadomy wyjątek od zasady „użyj tego, co jest w boilerplacie". |
| 9 | Jak reprezentować kwoty pieniężne (decimal vs integer) | Integer w najmniejszej jednostce waluty, zgodnie z konwencją Stripe — patrz §2.14. |
| 10 (v13) | Czy limity/plany są konfigurowane w kodzie (config, jak sugeruje boilerplate §5.2) czy w bazie danych | **Baza danych**, edytowalna z panelu Super Admin bez deploya (Zasada nadrzędna #6) — świadome odejście od domyślnego wzorca boilerplate'u ze względu na wpływ biznesowy i częstotliwość zmian. |
| 11 (v13) | Czy sprawdzenie limitu wymaga blokady bazodanowej (`FOR UPDATE`) analogicznej do §5 | **Nie** — akceptowalne minimalne ryzyko przejściowego przekroczenia limitu przy ręcznych, nieautomatycznych akcjach admina; inny profil ryzyka niż rezerwacje. |
| 12 (v13) | Czy downgrade blokuje się twardo, gdy organizacja przekracza nowe limity | **Nie** — wzorzec blokady nowych operacji, nie blokady samej zmiany planu (spójne z Zasadą nadrzędną #4). |
| 13 (v14) | Standard vs Express vs Custom Connect dla kont akademii | **Standard** — akademia w pełni zarządza własnym kontem Stripe (KYC, spory, wypłaty, podatki), platforma nie przejmuje żadnej z tych odpowiedzialności. Mniej płynny onboarding niż Express, ale minimalny zakres regulacyjny/wsparcia po stronie langlion — właściwy kompromis dla platformy B2B sprzedającej realnym firmom, nie freelancerom. |
| 14 (v14) | Czy `billing_connect.manage` jest dostępne dla roli Admin, tak jak inne uprawnienia finansowe (np. `refunds.issue`) | **Nie** — wyłącznie Owner. Podłączenie/odłączenie konta Stripe całej akademii to decyzja właścicielska (kto odbiera pieniądze), nie operacyjna, więc świadomie węższa niż pozostałe uprawnienia finansowe w §2.10. |
| 15 (14.1) | Czy klient (rodzic) reużywa boilerplate'owego User/magic link (§2.19) | **Nie** — odrębna, domenowa encja `client` z unikalnością `(organization_id, email)` i domenowym OTP per organizacja; osobna sesja od personelu. Pełna izolacja ekosystemów akademii z perspektywy klienta jest twardym wymogiem biznesowym. Czwarty świadomy wyjątek od reużycia boilerplate'u. |
| 16 (v15) | Czy `client_price_override` obejmuje wyłącznie cenę pojedynczych zajęć, czy także pakiety | **Także pakiety** — rabat działa na `group_type.price` ORAZ `product_template.price`, w tym `billing_type=recurring`. Konsekwencja: `credit_purchase.price_paid` zapisuje kwotę po rabacie, a formuła zwrotu (§2.9) liczy się od kwoty faktycznie zapłaconej. Patrz §2.31 i otwarty punkt o mechanice Stripe (§8). |
| 17 (v15) | Czy rabat na subskrypcji jest zamrażany przy jej starcie, czy sprawdzany przy każdym odnowieniu | **Sprawdzany przy każdym odnowieniu** (stan żywy, nie zamrożony). Ten sam wzorzec „na żywo, nie cache'owane", co przy limitach planu (§2.23). Cena może się różnić między cyklami, a `valid_until` wygasa samoczynnie bez akcji admina i bez powiadomienia klienta. Świadome odstępstwo od zamrażania z Zasady nadrzędnej #1 — rabat to bieżący stan uprawnienia, nie zamknięta transakcja. |
| 18 (v15) | Jak interpretować `trainer_rate.amount` — ryczałt za sesję, stawka godzinowa czy stawka za uczestnika | **Ryczałt za poprowadzoną sesję** — niezależny od liczby uczestników i długości zajęć. Najprostszy model, zgodny ze sposobem, w jaki akademie faktycznie umawiają się z trenerami; brak zaokrągleń przy sesjach niepełnogodzinnych i brak wiązania wynagrodzenia z frekwencją. |
| 19 (v15) | Czy potwierdzanie obecności rozszerza `payment_status` (np. o nową wartość), czy jest osobnym polem | **Osobne pole** `attendance_status`, całkowicie niezależne od `payment_status`; `no_show` zostaje bez zmian (§US-16.2) i nie jest z nim synchronizowany w żadną stronę. Te dwie osie odpowiadają na różne pytania („czy zapłacono" vs „czy przyszedł") i bywają dowolną kombinacją. |

---

## 8. Otwarte punkty — do rozstrzygnięcia na końcowym etapie przed wdrożeniem

Świadomie odłożone na sam koniec (nie blokują startu implementacji pozostałych modułów):

| # | Punkt | Status |
|---|---|---|
| 1 | Formuła zwrotu proporcjonalnego przy przyszłych promocjach/cenach warstwowych w pakiecie | Poprawna tylko dla obecnego, płaskiego modelu cenowego — do rewizji, gdy pojawią się promocje. |
| 7 (v13) | Czy próg ostrzegawczy (90%) dla `plan_limit_approaching` jest globalny, czy konfigurowalny per `limit_key` | Do rozstrzygnięcia przed implementacją US-29.3 — nie blokuje startu reszty EPIK 29. |
| 8 (v15) | **Mechanika Stripe dla rabatu klienta na subskrypcji** | `product_template.stripe_price_id` wskazuje stałą cenę na Connected Account, więc nie da się nim wyrazić rabatu per klient, w dodatku zmiennego między cyklami (Rozstrzygnięcie #17). Do rozstrzygnięcia przed implementacją EPIK 33: `coupon`/`promotion_code` przypięty do Subscription, cena ad-hoc tworzona per klient, czy aktualizacja `subscription_item` przed odnowieniem. Ta sama kwestia w łatwiejszym wariancie dotyczy jednorazowego Checkoutu (cena ad-hoc zamiast gotowego `stripe_price_id`). **Blokuje EPIK 33**, nie blokuje pozostałego zakresu. |

---

**Koniec dokumentu.**