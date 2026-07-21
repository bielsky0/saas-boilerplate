### 1.2 Encje — pełna specyfikacja pól (część 1: rdzeń — organizacje, lokalizacje, grupy, sesje, klienci, rezerwacje)

#### organization

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| name | string | |
| slug | string, unikalny globalnie | **wycofany z roli identyfikatora panelu personelu** (dawniej `/orgs/{slug}`) — panel akademii żyje pod `{subdomain}.langlion.pl/dashboard`. Może zostać zachowany wyłącznie jako wewnętrzny identyfikator URL-i panelu Super Admina (cross-tenant, gdzie subdomena nie ma zastosowania) — do potwierdzenia przy implementacji. Patrz §2.27 |
| subdomain | string, unikalny **globalnie** (rewizja 14.2) | etykieta DNS publicznej witryny akademii: `{subdomain}.langlion.pl`. Wymóg globalnej unikalności pochodzi od DNS, nie od nas. Pole wymagane, **bez wartości domyślnej** i **nigdy nieautogenerowane z `name`** (kolizje nazw akademii są realne) — ta sama zasada co `currency`. Walidacja: etykieta DNS wg RFC 1035, 3–63 znaki, plus lista nazw zarezerwowanych (`www`, `api`, `admin`, `cdn`…). Patrz §2.27 |
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
| description | text/markdown, nullable (v15) | opis oferty prezentowany klientowi na publicznej stronie rejestracji (`{organization.subdomain}.langlion.pl/zapisy/{slug}`, §2.27). Czysto prezentacyjny — nie wpływa na żadną logikę rezerwacji, cenową ani na walidację zapisu. Pole opcjonalne: brak opisu = sekcja nie jest renderowana |
| engine | enum | `schedule_first` \| `availability_first` \| `slot_first` |
| payment_policy | enum/set | dozwolone metody: online / na miejscu / oba — METODA płatności, niezależna od trybu zakupu poniżej |
| price | integer (najmniejsza jednostka waluty, np. grosze) | cena pojedynczych zajęć w walucie `organization.currency`; baza dla `booking.price_snapshot`, `credit.source=online_payment/on_site_payment` |
| is_new_client_only | boolean | patrz US w epiku Rejestracja |
| eligible_trainer_ids | list FK | pusta = wszyscy aktywni trenerzy |
| default_location_id | FK `location`, nullable | domyślna lokalizacja dla wszystkich wzorców/sesji tego typu, o ile nie nadpisana na poziomie wzorca |
| allowed_purchase_modes | set enum, wymagane min. 1 wartość | `single_class` (zakup pojedynczych zajęć) \| `package` (wyłącznie/dodatkowo pakiet) |
| allowed_billing_types | set enum, wymagane gdy `package` w `allowed_purchase_modes` | `one_time` \| `recurring` — dopuszczalne typy rozliczenia pakietów dla tego typu grupy |
| policy_document_id | FK `policy_document`, nullable | wskazuje aktualnie obowiązujący regulamin tego typu grupy; brak wartości = krok akceptacji regulaminu pomijany przy zapisie |
| default_duration_minutes | int, nullable (v16) | domyślna długość sesji tworzonej **w locie** przez silniki bez wzorca (Availability-First `is_recurring=false`, Slot-First), gdy nie istnieje `group_type_recurrence` niosący `duration`. Używane wyłącznie przez te silniki; Schedule-First nadal bierze długość z wzorca. Patrz §2.32 |
| default_capacity | int, nullable (v16) | domyślna pojemność sesji tworzonej **w locie** przez silniki bez wzorca; kopiowana do `session.capacity` przy tworzeniu, dalej edytowalna per-sesja. Ten sam wzorzec dziedziczenia co `group_type_recurrence.capacity → session.capacity`. Patrz §2.32 |
| status | enum, default `scheduled` (v17) | `scheduled` \| `collecting_interest`. `collecting_interest` = oferta zbiera zainteresowanie i **nie ma jeszcze sesji**; strona publiczna renderuje wariant zbierający `interest_signup` zamiast kalendarza (§2.34, EPIK 36). Powrót do `scheduled` następuje, gdy admin ustali harmonogram (utworzy wzorzec/sesje) i zacznie ręcznie przenosić zainteresowanych do rezerwacji. Czysto sterujący prezentacją i ścieżką zapisu; nie wpływa na cenę ani na ochronę §5 |
| requires_qualification_card | boolean, default false (v18) | oferta jest wypoczynkiem (kolonie/półkolonie) wymagającym **karty kwalifikacyjnej uczestnika wypoczynku** (`qualification_card`, §2.40, EPIK 41). `true` = ścieżka zapisu/obsługi dokłada wymóg karty. **Nota:** czy sygnalizacja obozu ma być tą flagą boolean, czy szerszym polem `category` (obóz \| półkolonia \| …) jest otwartym punktem (§8, #17). Czysto sterujące ścieżką; nie wpływa na cenę ani ochronę §5 |
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
| password_hash | string, nullable (v19) | hash hasła (algorytm — do zweryfikowania z wzorcem boilerplate'u, patrz §8 #26 — nie wymyślać osobnego). `NULL` = klient nie ustawił hasła i loguje się wyłącznie kodem OTP (bez regresji względem zachowania sprzed v19). Ustawiane **wyłącznie** przez klienta z ekranu propozycji po rezerwacji (§2.43) lub przy wymuszonym resecie — nigdy przy zapisie/rejestracji (US-4.1) |
| password_set_at | timestamp, nullable (v19) | moment pierwszego ustawienia hasła |
| password_updated_at | timestamp, nullable (v19) | moment ostatniej zmiany/resetu hasła — rozróżnienie od `password_set_at` analogiczne do par `created_at`/`updated_at` używanych gdzie indziej w dokumencie |

Personel akademii (Owner/Admin/Recepcja/Trener) pozostaje bez zmian na boilerplate'owym User + Membership (§2.19). Logowanie klienta: domenowy OTP scoped do `(organization_id, email)` — kod wydany w Akademii A jest bezużyteczny w Akademii B, nawet dla identycznego adresu e-mail. **Hasło (v19) jest alternatywną, nie równoległą ścieżką logowania** — patrz §2.43 dla pełnego modelu i uzasadnienia.

#### athlete

| Pole | Typ | Opis |
|---|---|---|
| id | PK | |
| parent_client_id | FK → `client` | |
| name, age | | `age` opcjonalny |
| emergency_contact_name | string, nullable (v17) | kontakt awaryjny — imię/nazwisko osoby do kontaktu w razie zdarzenia na zajęciach (§2.35, EPIK 37) |
| emergency_contact_phone | string, nullable (v17) | telefon kontaktu awaryjnego |
| health_notes | text, nullable (v17) | wolne pole uwag zdrowotnych istotnych dla bezpieczeństwa (alergie, przeciwwskazania). **Dane wrażliwe** — ograniczenie widoczności wewnątrz organizacji i szyfrowanie w spoczynku są otwartym punktem (§8, uprawnienie `athlete_health.view`) |

Pola profilu (v17) są **opcjonalne przy zapisie** (US-4.1) i uzupełnialne później z panelu klienta (§2.35). Zgody prawne (na wizerunek itp.) NIE żyją na `athlete` — to osobny, wersjonowany byt `athlete_consent` (patrz 01e-funkcje-v17-v18.md), tym samym wzorcem co `policy_acceptance` (§2.18).

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

Powiązane: 01c-kredyty-platnosci-stawki.md, 01f-relacje-integralnosc.md
