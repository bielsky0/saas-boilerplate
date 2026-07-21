### 1.2 Encje — pełna specyfikacja pól (część 3: regulaminy, powiadomienia, plany subskrypcji)

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

Powiązane: 01f-relacje-integralnosc.md
