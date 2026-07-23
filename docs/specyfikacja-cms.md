# Specyfikacja funkcjonalna: Moduł Website Builder (Payload CMS)

**Wersja dokumentu: 2** (2026-07-22). Trzy zmiany względem wersji 1: (1) bloki dzielą się na core (dostępne domyślnie, bez grantu) i custom/sekcje (wymagają grantu przez `tenant_block_access`, jak dotąd), (2) stylowanie bloków idzie wyłącznie przez predefiniowany słownik w kodzie — zakaz przechowywania klas Tailwind w bazie, (3) nowa encja `theme` per organizacja (motywy w stylu Shopify) wraz z przygotowaną, na razie nieaktywną furtką pod `plan_feature_flag` dla przyszłego różnicowania planowego bloków custom.
**Dokument siostrzany:** `docs/specyfikacja.md` (wersja 15, rewizja 15.1) — moduł Grup i Rezerwacji. Odwołania „§X" bez dopisku wskazują sekcje **tego** dokumentu; odwołania „spec §X" wskazują `docs/specyfikacja.md`; „boilerplate §X" wskazuje `docs/boilerplate-spec.md`.
**Format:** Model danych → Opis funkcjonalności → User Stories i Acceptance Criteria → Decyzje
**Odbiorcy:** zespół deweloperski / Claude Code, QA, product owner

---

## 0. Kontekst i zasada nadrzędna

Moduł Website Builder pozwala każdej akademii (organization) zbudować i publikować własną witrynę pod jej subdomeną, bez udziału deweloperów. Silnikiem jest **Payload CMS**, osadzony w tej samej aplikacji Next.js i tej samej bazie PostgreSQL co moduł Grup i Rezerwacji.

**Zasada nadrzędna #1 — Jedna aplikacja, jedna baza, jedna tożsamość:** Payload nie jest osobnym systemem zintegrowanym przez API. Współdzieli instancję Postgres (§4, decyzja 1), sesję personelu (decyzja 3), storage (decyzja 6) i mapę RBAC (decyzja 4) z modułem głównym. Wszędzie, gdzie Payload oferuje własny, równoległy mechanizm (uploady, tożsamość użytkownika), używamy istniejącego mechanizmu aplikacji — to bezpośrednie zastosowanie Zasady nadrzędnej #5 spec (fundament, nie duplikacja).

**Zasada nadrzędna #2 — Izolacja tenantowa tym samym wzorcem co reszta aplikacji:** każda tabela CMS niesie `organization_id` i podlega RLS wg wzorca z migracji `0015`–`0017` modułu głównego. Payload nie ustawia kontekstu RLS sam z siebie — wymaga jawnego hooka (decyzja 2). RLS jest **drugą linią obrony**, nie jedyną: warstwa dostępu do danych nadal filtruje po tenancie.

**Zasada nadrzędna #3 — Blok jest widoczny tylko wtedy, gdy jawnie nadany:** rejestracja bloku w kodzie nie czyni go dostępnym dla żadnej akademii. Widoczność rozstrzyga wiersz w `tenant_block_access` (decyzja 7) — wzorzec ręcznego nadania, ten sam co `client_price_override` i `credits.manual_grant` w spec.

### Zależności blokujące

Moduł **nie może wystartować przed zbudowaniem middleware'u subdomenowego** — tego samego, który blokuje EPIK 4 (publiczna rejestracja klienta) w `docs/plan-implementacji.md`. Publiczna strona CMS i trasy aplikacji (`/dashboard`, `/admin`) współdzielą subdomenę akademii i rozstrzygają się jednym punktem rozpoznania `Host` → `organization_id` (spec §2.27). **Nie projektować drugiego, równoległego routingu** — to jedna zależność wspólna dla obu modułów.

Pozostałe zależności: `organization.subdomain` (istnieje od Fazy 0), sesja personelu Better Auth i mapa RBAC (`src/features/rbac/index.ts`), adapter storage boilerplate §21, wrapper RLS `src/lib/db/tenant.ts`.

---

## 1. Model danych

### 1.1 Diagram relacji (opis tekstowy)

```
organization (1) ──< page (N)
                │      └── slug (unikalny per organization_id, walidowany wobec listy zarezerwowanej)
                │      └── blocks (jsonb) ──> block_key ──> tenant_block_access (widoczność w edytorze, TYLKO dla bloków custom — core bloki pomijają tę bramkę, §2.6)
                │      └── updated_by_user_id ──> User (personel, spec §2.19)
                │
                ├──< media (N) ── file_id ──> storage (boilerplate §21, prefiks `org/{id}`)
                │
                ├──< tenant_block_access (N) ── block_key / granted_by_user_id ──> User
                │
                └──< theme (1) ── organization_id (unikalność 1:1) — motyw stylowania per akademia (§2.8)
```

Żadna tabela CMS nie jest powiązana FK z encjami domenowymi modułu głównego (`group_type`, `class_session`, `booking`). Bloki prezentujące dane domenowe (np. `ScheduleGrid`) czytają je **przez zapytanie w kontekście tenanta**, nie przez relację w schemacie — dzięki temu usunięcie strony nigdy nie dotyka danych rezerwacyjnych, a zmiana modelu domenowego nie wymaga migracji CMS.

### 1.2 Encje — pełna specyfikacja pól

#### page

| Pole                   | Typ                                        | Opis                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                     | PK                                         |                                                                                                                                                                                                                                                                                                  |
| organization_id        | FK, wymagane                               | izolacja tenant; ustawiane automatycznie z kontekstu żądania, nigdy z ciała żądania                                                                                                                                                                                                              |
| slug                   | string, unikalny **per `organization_id`** | człon ścieżki publicznej: `{organization.subdomain}.langlion.pl/{slug}`. Walidowany wobec listy zarezerwowanych sluggów (§2.1) — zapis kolidujący jest odrzucany. **Strona główna akademii ma slug pusty (`""`)** — renderowana pod gołym `{organization.subdomain}.langlion.pl` (§4, decyzja 8) |
| title                  | string, wymagane                           | tytuł strony (`<title>`, nagłówek na liście stron w panelu)                                                                                                                                                                                                                                      |
| status                 | enum                                       | `draft` \| `published` — wyłącznie `published` jest renderowane publicznie; `draft` widoczny tylko w panelu                                                                                                                                                                                      |
| blocks                 | jsonb                                      | treść strony jako tablica bloków (`block_key` + dane pola). Struktura zarządzana przez Payload. Bloki dzielą się na **core** (Grid, Column, Text, Button, Image, Separator, Accordion — dostępne domyślnie w edytorze każdej akademii, bez wpisu w `tenant_block_access`, §2.6) i **custom/sekcje** (wymagają grantu, jak dotąd). Rozróżnienie nie zmienia typu kolumny — nadal jeden `jsonb`, oba rodzaje bloków współistnieją w tej samej tablicy |
| updated_by_user_id     | FK → User, nullable                        | kto ostatnio zapisał stronę (personel — boilerplate User, spec §2.19); historia zmian odtwarzalna z audit trail                                                                                                                                                                                  |
| created_at, updated_at | timestamp                                  |                                                                                                                                                                                                                                                                                                  |
| is_active / deleted_at | soft delete                                | dezaktywacja/usunięcie strony nie kasuje wiersza — ten sam wzorzec co EPIK 20 spec. Strona `deleted_at IS NOT NULL` zwraca 404 publicznie i znika z listy w panelu                                                                                                                               |

#### media

| Pole                   | Typ                                      | Opis                                                                                                              |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| id                     | PK                                       |                                                                                                                   |
| organization_id        | FK, wymagane                             | izolacja tenant                                                                                                   |
| file_id                | FK → storage (boilerplate §21), wymagane | plik binarny żyje w istniejącym buckecie, pod prefiksem `org/{id}` — nie w osobnym magazynie Payloada (decyzja 6) |
| alt_text               | string, nullable                         | tekst alternatywny; brak wartości nie blokuje zapisu, ale jest sygnalizowany w edytorze (dostępność)              |
| is_active / deleted_at | soft delete                              | spójne z soft delete storage'u boilerplate'u i jego jobem `storage.purge`                                         |

#### tenant_block_access

Rejestr bloków nadanych konkretnej akademii. Brak wiersza = blok nie istnieje z perspektywy edytora tej akademii.

| Pole               | Typ              | Opis                                                                                                                           |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| id                 | PK               |                                                                                                                                |
| organization_id    | FK, wymagane     | izolacja tenant                                                                                                                |
| block_key          | string, wymagane | identyfikator bloku zarejestrowanego w kodzie (np. `hero_section`, `schedule_grid`). Unikalność `(organization_id, block_key)` |
| granted_at         | timestamp        |                                                                                                                                |
| granted_by_user_id | FK → User        | kto nadał dostęp; wraz z audit trail daje pełny ślad decyzji                                                                   |

#### theme

Motyw stylowania jednej akademii — w stylu Shopify, jeden rekord na organizację. **Świadomie nowa kolekcja Payload, NIE Payload Global** — Payload Globals nie są tenant-scoped z natury; naiwna implementacja jako Global dałaby jeden wspólny motyw wszystkim akademiom w SaaS. To zastrzeżenie analogiczne do już istniejącej decyzji #2 (custom hook RLS) — wszędzie, gdzie Payload oferuje mechanizm nie licząc się z tenancją, trzeba go świadomie ominąć (§4, decyzja #11).

| Pole                   | Typ                  | Opis                                                                                                          |
| ---------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| id                     | PK                   |                                                                                                                |
| organization_id        | FK, wymagane, unikalne (1:1) | izolacja tenant; dokładnie jeden `theme` per akademia — zapis drugiego rekordu dla tej samej organizacji jest odrzucany przez unikalność |
| font_primary           | string, wymagane     | nazwa fontu głównego (treść witryny)                                                                          |
| font_heading           | string, wymagane     | nazwa fontu nagłówkowego                                                                                      |
| color_primary          | string, wymagane     | kolor primary (hex/token), wstrzykiwany jako `--color-primary` (§2.8)                                          |
| color_secondary        | string, wymagane     | kolor secondary (hex/token), wstrzykiwany jako `--color-secondary` (§2.8)                                      |
| created_at, updated_at | timestamp            |                                                                                                                |

### 1.3 Kluczowe relacje i reguły integralności

- **RLS na wszystkich czterech tabelach** (`page`, `media`, `tenant_block_access`, `theme`) — polityki `*_tenant_isolation` / `*_system_bypass` wg wzorca z migracji `0015`–`0017`, `ENABLE` + `FORCE`. Przed włączeniem `FORCE`: bramka danych na roli właściciela i **przed** migracją (wzorzec z F1a planu implementacji — wiersz bez właściciela nie staje się błędem, tylko cicho niewidocznym wierszem). Na `theme` dodatkowo unikalność `(organization_id)` — gwarantuje dokładnie jeden motyw per akademia, niezależnie od RLS.
- **Walidacja grantu `tenant_block_access` jest rekursywna, nie płytka** — przy zapisie strony sprawdzane jest **całe** zagnieżdżone drzewo `blocks` (np. `Grid` → `Column` → atomy), nie tylko top-level poziom tablicy. Blok custom bez grantu ukryty głębiej w drzewie (wewnątrz `Column` wewnątrz `Grid`) odrzuca zapis tak samo jak blok custom na najwyższym poziomie — jedna bramka, egzekwowana na każdym poziomie zagnieżdżenia (§3, US-C4.1/AC5).
- **Kolizja slugu z trasą aplikacji jest błędem walidacji, nie sytuacją do rozstrzygnięcia w runtime** — `page.slug` sprawdzany wobec listy zarezerwowanej przy każdym zapisie, po stronie backendu, niezależnie od tego, co pokazuje edytor.
- **`organization_id` nigdy nie pochodzi z ciała żądania** — zawsze z kontekstu tenanta rozstrzygniętego przez middleware. To ta sama zasada, którą spec §1.3 stosuje do zdenormalizowanych `organization_id` na `session`/`booking`/`credit`.
- **Przed dodaniem którejkolwiek tabeli: grep po katalogu schematu pod kątem kolizji nazw eksportów.** `export *` z dwóch modułów eksportujących tę samą nazwę nie jest błędem — nazwa staje się niejednoznaczna i zostaje cicho pominięta, a drizzle-kit generuje wtedy FK wskazujący na inną tabelę (zdarzyło się raz: `session` ↔ Better Auth, spec §2.28). Nazwa `media` jest tu podwyższonego ryzyka.

---

## 2. Opis funkcjonalności — moduły

### 2.1 Rozstrzyganie trasy: aplikacja czy strona CMS

Dashboard personelu, panel CMS i publiczna witryna współdzielą subdomenę akademii (spec §2.27). Jeden punkt rozpoznania `Host` → `organization_id`, z rozgałęzieniem po prefiksie ścieżki:

| Ścieżka                     | Cel                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `/dashboard/…`              | panel personelu (moduł Grup i Rezerwacji)                                                           |
| `/admin/…`                  | panel CMS (Payload)                                                                                 |
| `/api/…`                    | API aplikacji                                                                                       |
| `/zapisy/{group_type.slug}` | publiczna rejestracja klienta (EPIK 4 spec)                                                         |
| `/login`, `/logout`         | autentykacja personelu                                                                              |
| `/` (goła subdomena)        | strona główna akademii — `page` ze slugiem pustym (`""`), bez przekierowania (§4, decyzja 8)        |
| **wszystko inne**           | wyszukanie `page` po slugu w kontekście tego tenanta → render przez Payload; brak dopasowania = 404 |

**Lista zarezerwowanych sluggów żyje w jednym pliku źródłowym** (`src/features/cms/reserved-slugs.ts` lub analogiczny), importowanym zarówno przez middleware, jak i przez walidację formularza tworzenia strony. Dwie kopie tej listy rozjechałyby się przy pierwszej nowej trasie aplikacji, a objaw byłby odległy od przyczyny: strona zapisuje się poprawnie i jest niedostępna publicznie, bo przechwytuje ją routing aplikacji. Startowa lista: `dashboard`, `admin`, `api`, `zapisy`, `login`, `logout`.

### 2.2 Izolacja tenantowa w Payloadzie

Payload wykonuje własne zapytania do bazy, poza warstwą DAL modułu głównego — sam z siebie **nie ustawia kontekstu RLS**. Wymaga to custom hooka (`beforeOperation` lub analogicznego), który przed każdą operacją ustawia kontekst tenanta rozstrzygniętego z requestu.

**Uwaga wdrożeniowa:** repo ustawia GUC przez `set_config('app.organization_id', …, true)`, nie przez `SET LOCAL` — `SET LOCAL` nie przyjmuje placeholdera i wymuszałby sklejanie stringa z `orgId` (patrz `src/lib/db/tenant.ts` i „Ryzyka techniczne" w planie implementacji). Trzeci argument `true` = zasięg transakcji; `false` dałby zasięg sesji i wyciek kontekstu przez pulę połączeń. Hook Payloada musi iść dokładnie tą samą ścieżką, nie budować drugiej.

Zapomniany kontekst **nie rzuca błędu** — zapytanie zwraca zero wierszy i wygląda jak „brak danych". Dlatego fail-closed bez kontekstu jest jawnym kryterium testowym (§3, US-C1.4).

### 2.3 Autoryzacja: pełne SSO z sesją personelu

Payload **nie ma własnej, równoległej tożsamości użytkownika** dla personelu akademii. Custom Payload auth strategy waliduje sesję Better Auth bezpośrednio — ten sam User, ta sama sesja, ta sama mapa RBAC co w dashboardzie.

Panel CMS żyje pod tą samą subdomeną co reszta panelu akademii (spec §2.27), więc cookie sesji **nie wymaga scope'u wildcard** — jest scoped do konkretnego hosta akademii. Jest to spójne z piątym świadomym wyjątkiem od reużycia boilerplate'u (spec §2.19, rewizja 15.1): skoro nie istnieje przełącznik organizacji, a każda akademia wymaga osobnej autentykacji, scope per host jest **modelem docelowym, nie tymczasowym uproszczeniem**.

### 2.4 RBAC: uprawnienie `cms.manage`

| Uprawnienie  | Domyślne role | Uwaga                                                                       |
| ------------ | ------------- | --------------------------------------------------------------------------- |
| `cms.manage` | Owner, Admin  | tworzenie/edycja/publikacja stron, upload mediów, dostęp do panelu `/admin` |

Zakres Owner/Admin wynika z charakteru zadania: **zarządzanie treścią publicznej strony akademii jest zadaniem operacyjnym/marketingowym, nie decyzją właścicielską** w rodzaju dostępu do konta bankowego. Stąd zakres szerszy niż `billing_connect.manage` (spec §2.10, wyłącznie Owner) i węższy niż uprawnienia recepcyjne — Recepcja i Trener nie mają dostępu do CMS.

Uprawnienie definiuje się w tej samej statycznej mapie RBAC co uprawnienia domenowe modułu głównego (`src/features/rbac/index.ts`), nie jako osobny mechanizm Payloada. Egzekwowanie na backendzie, niezależnie od tego, co pokazuje UI — ta sama zasada co spec §4.2.

### 2.5 Storage: custom StorageAdapter nad adapterem boilerplate'u

Payload **nie używa własnego ani natywnego mechanizmu uploadów**. Piszemy custom `StorageAdapter` zgodny z interfejsem Payloada, który wewnątrz woła istniejący adapter S3-compatible boilerplate'u (§21).

Konsekwencje, wszystkie zamierzone: jeden bucket, jedna polityka retencji, jeden job `storage.purge`, jeden mechanizm presigned URL — i **ten sam wzorzec prefiksu izolacji `org/{id}`**, który obowiązuje już dla `policy_document.file_id` (spec §2.18). Drugi magazyn oznaczałby drugą politykę retencji i drugie miejsce, w którym prefiks izolacji może się rozjechać.

### 2.6 Core bloki i custom bloki/sekcje per tenant

Bloki dzielą się na dwie kategorie, z **jednym mechanizmem widoczności** (`tenant_block_access`) i różnym domyślnym traktowaniem:

- **Core bloki** — `Grid`, `Column` (wrappery/kontenery layoutu: `Grid` zarządza siatką — liczba kolumn 1/2/3/4, odstępy small/medium/large; `Column` przyjmuje tablicę zagnieżdżonych bloków) oraz `Text`, `Button`, `Image`, `Separator`, `Accordion` (atomy UI). Core bloki są **dostępne domyślnie dla każdej akademii, bez wpisu w `tenant_block_access`** — bez nich nie da się złożyć żadnej strony. To odejście od dosłownej treści Zasady nadrzędnej #3 („blok widoczny tylko po jawnym nadaniu") — świadome **zawężenie** zasady do bloków spoza tej listy, nie jej cofnięcie (§4, decyzja #9).
- **Custom bloki/sekcje** — wszystko poza core (dzisiejsze przykładowe `HeroSection`/`PricingTable`/`ScheduleGrid`, oraz przyszłe bloki pisane na zamówienie konkretnej akademii, wystawiane po deployu). „Sekcja" to pojęciowo większy/bardziej złożony blok tej samej kategorii — **jeden mechanizm** (`tenant_block_access`), nie dwa równoległe. Wymagają jawnego grantu, dokładnie jak dotąd: blok zarejestrowany w kodzie jest widoczny w edytorze konkretnej akademii **wyłącznie przy istniejącym, pasującym wierszu** w `tenant_block_access`. Sprawdzenie odbywa się przy renderowaniu funkcyjnej konfiguracji pola `blocks` w Payloadzie, na podstawie tenanta z requestu — **rekursywnie, na każdym poziomie zagnieżdżenia** (§1.3).

Bloki — core i custom — zapisują **wyłącznie treść i intencję konfiguracyjną** (np. rozmiar, wariant), **nigdy surowy HTML/CSS**. Tłumaczenie intencji na wygląd jest zadaniem warstwy stylowania (§2.7), nie modelu danych.

Nadawanie custom bloków jest **ręczne**, analogicznie do `client_price_override` i `credits.manual_grant` w spec. Każdy custom blok/sekcja dostaje w rejestrze kodu **opcjonalny `feature_key`** — przygotowana furtka pod `plan_feature_flag` (EPIK 29 spec, §2.20–§2.23). Widoczność bloku pozostaje rozstrzygana **wyłącznie** przez `tenant_block_access`, niezależnie od `plan_feature_flag`: dziś mechanizm planowy jest **fail-open** dla bloków — brak wpisu w `plan_feature_flag` dla danego `feature_key` niczego nie blokuje, żaden blok nie jest dziś różnicowany planem. To jest **przygotowanie furtki, NIE aktywacja różnicowania planowego** — rozróżnienie zapisane jawnie, żeby przy realizacji nikt nie pomylił „mechanizm istnieje w schemacie/rejestrze" z „mechanizm jest włączony". Kontrast celowy: dla reszty SaaS `plan_feature_flag` jest **fail-closed** (brak wpisu blokuje, spec §2.21) — bloki custom są dziś świadomym wyjątkiem od tego wzorca, nie jego powtórzeniem. Aktywacja w przyszłości = dopisanie wierszy do `plan_feature_flag`, bez zmiany schematu ani kodu bloków (§4, decyzja #7 — zrewidowana; §6, Odłożone poza MVP).

**Ryzyko kolizji nazw eksportów** (już odnotowane przy tabeli `media`, §1.3) rozciąga się na rejestr komponentów atomowych w kodzie: `Grid`, `Text`, `Image`, `Button` są nazwami wysokiego ryzyka kolizji z innymi modułami/bibliotekami. Grep po katalogu rejestru bloków przed dodaniem którejkolwiek z tych nazw — ten sam wzorzec co D11 w planie implementacji.

### 2.7 Mapowanie stylowania

**Twardy zakaz przechowywania klas Tailwind w bazie.** Edytor Payload eksponuje wyłącznie predefiniowane opcje z dropdownów (np. wariant przycisku: `primary`/`secondary`, rozmiar: `small`/`large`) — nigdy pole wolnego tekstu na klasy CSS. Next.js tłumaczy zapisany parametr przez **słownik zdefiniowany w kodzie** na docelowe klasy Tailwind, w momencie renderowania.

Przykład: pole `size` na bloku `Button` przyjmuje wyłącznie `"small" | "large"`. Renderer mapuje przez słownik kodu:

```
"small" → "px-3 py-1.5 text-sm"
"large" → "px-6 py-3 text-lg"
```

**Konsekwencja zapisana jawnie:** zmiana wyglądu „dużego przycisku" globalnie w całym SaaS = **jedna zmiana w słowniku kodu**, zero migracji, zero dotykania zapisanych stron. Baza nigdy nie niesie żadnej wiedzy o tym, jak wygląda konkretna klasa Tailwind — wyłącznie intencję (§2.6).

### 2.8 Motywy

Encja `theme` (§1.2) niesie tożsamość wizualną akademii: font główny, font nagłówkowy, kolor primary, kolor secondary — jeden rekord per organizacja, w stylu Shopify. Wartości pobierane przez Next.js do głównego layoutu i wstrzykiwane jako zmienne CSS do `:root` (np. `--color-primary`, `--color-secondary`, `--font-primary`, `--font-heading`), **per subdomena** — ten sam punkt rozpoznania `Host` → `organization_id` co reszta modułu (spec §2.27, §2.1). Zmiana motywu nie wymaga edycji zapisanych stron — bloki referencjonują zmienne CSS pośrednio przez klasy Tailwind (`text-[color:var(--color-primary)]` lub odpowiednik konfiguracji Tailwind), nie stałe kolory.

Edycja `theme` wymaga uprawnienia `cms.manage` (Owner, Admin) — ta sama para ról co edycja stron i mediów (§2.4, §4 decyzja #12); ustawienie motywu jest tą samą kategorią zadania operacyjnego/marketingowego, nie decyzją właścicielską.

---

## 3. User Stories i Acceptance Criteria

Konwencja jak w `docs/specyfikacja.md`: Given/When/Then, numeracja `US-C<nr>.<nr>` (C = CMS, żeby nie kolidować z numeracją modułu głównego).

### EPIK C1 — Strony: tworzenie, publikacja, izolacja

**US-C1.1** Jako administrator akademii, chcę utworzyć i opublikować stronę, aby moja witryna była widoczna publicznie.

- AC1: Given mam uprawnienie `cms.manage`, When tworzę `page` ze slugiem i tytułem, Then powstaje wiersz ze `status=draft`, a `organization_id` jest ustawiane z kontekstu tenanta, nie z ciała żądania.
- AC2: Given strona ma `status=draft`, When ktokolwiek otwiera jej publiczny adres, Then otrzymuje 404 — treść nieopublikowana nigdy nie wycieka publicznie.
- AC3: Given zmieniam `status` na `published`, When otwieram `{subdomain}.langlion.pl/{slug}`, Then strona renderuje się z zapisanymi blokami.
- AC4: Given zapisuję stronę, When sprawdzam wiersz, Then `updated_by_user_id` i `updated_at` wskazują autora i moment ostatniego zapisu, a zmiana jest widoczna w audit trail (boilerplate §6.4).
- AC5: Given tworzę stronę ze slugiem pustym (`""`) i publikuję ją, When otwieram gołą subdomenę `{organization.subdomain}.langlion.pl`, Then renderuje się ta strona, **bez przekierowania** na jakikolwiek dodatkowy człon ścieżki (§4, decyzja 8).
- AC6: Given moja akademia ma już stronę o pustym slugu, When próbuję utworzyć drugą, Then zapis jest odrzucany przez unikalność `(organization_id, slug)` — najwyżej jedna strona główna per akademia.
- AC7: Given moja akademia nie ma żadnej opublikowanej strony o pustym slugu, When ktokolwiek otwiera gołą subdomenę, Then otrzymuje 404 tym samym mechanizmem co każdy inny niedopasowany adres — brak strony głównej nie jest przypadkiem szczególnym.

**US-C1.2** Jako administrator, chcę mieć pewność, że slug mojej strony nie przechwyci trasy aplikacji.

- AC1: Given próbuję zapisać `page.slug` równy `dashboard`, `admin`, `api`, `zapisy`, `login` lub `logout`, When zapisuję, Then walidacja odrzuca zapis z komunikatem wskazującym kolizję.
- AC2: Given wysyłam ten sam zapis bezpośrednio przez API, z pominięciem formularza, When żądanie dociera do backendu, Then jest odrzucane — walidacja slugu jest backendowa, nie kosmetyczna.
- AC3: Given lista zarezerwowanych sluggów zostaje rozszerzona o nową trasę aplikacji, When sprawdzam, gdzie trzeba ją zmienić, Then istnieje dokładnie jedno miejsce (`reserved-slugs.ts`) importowane zarówno przez middleware, jak i przez walidację formularza.
- AC4: Given dwie różne akademie tworzą stronę o tym samym slugu, When obie zapisują, Then obie operacje się powodzą — unikalność jest per `organization_id`, nie globalna.

**US-C1.3** Jako właściciel platformy, chcę, aby treść jednej akademii była niewidoczna dla innej, nawet przy błędzie w warstwie aplikacji.

- AC1: Given akademie A i B mają strony, When zapytanie o `page`/`media`/`tenant_block_access` pominie filtr aplikacyjny, Then zwracane są wyłącznie wiersze `organization_id = A` (RLS jako druga linia obrony — odpowiednik US-1.1/AC1 spec).
- AC2: Given operacja próbuje zapisać wiersz do cudzego tenanta, When zapis dociera do bazy, Then jest odrzucany (`42501`).

**US-C1.4** Jako system, chcę zawodzić zamknięcie, gdy kontekst tenanta nie został ustawiony.

- AC1: Given zapytanie Payloada wykonuje się bez ustawionego kontekstu tenanta, When trafia do bazy, Then zwraca zero wierszy zamiast danych dowolnej akademii.
- AC2: Given operacja Payloada zakończyła się w kontekście tenanta, When natychmiast po niej wykonywane jest zapytanie bez kontekstu, Then zwraca zero wierszy — kontekst nie wycieka przez pulę połączeń.

### EPIK C2 — Dostęp i uprawnienia

**US-C2.1** Jako właściciel akademii, chcę, aby dostęp do CMS miały wyłącznie role zarządcze.

- AC1: Given jestem Ownerem lub Adminem, When otwieram `/admin`, Then mam dostęp do panelu CMS.
- AC2: Given jestem Recepcją lub Trenerem, When otwieram `/admin`, Then dostaję odmowę (403) — brak uprawnienia `cms.manage`.
- AC3: Given wysyłam żądanie zapisu strony bezpośrednio przez API bez uprawnienia, When żądanie dociera do backendu, Then jest odrzucane niezależnie od tego, co pokazuje UI.

**US-C2.2** Jako członek personelu, chcę logować się do CMS tą samą sesją co do dashboardu.

- AC1: Given jestem zalogowany w dashboardzie akademii, When przechodzę do `/admin` pod tą samą subdomeną, Then nie muszę logować się ponownie — Payload waliduje istniejącą sesję Better Auth.
- AC2: Given mam Membership w dwóch niepowiązanych akademiach, When loguję się w akademii A i otwieram `/admin` akademii B, Then wymagane jest osobne logowanie — brak przełącznika i brak współdzielonej sesji między organizacjami (spec §2.19, piąty świadomy wyjątek).
- AC3: Given wylogowuję się z dashboardu, When wracam do `/admin`, Then sesja CMS również nie obowiązuje — jest to jedna sesja, nie dwie.

### EPIK C3 — Media

**US-C3.1** Jako administrator, chcę wgrać zdjęcie i użyć go na stronie.

- AC1: Given wgrywam plik przez panel CMS, When upload się kończy, Then plik trafia do istniejącego bucketa boilerplate'u pod prefiksem `org/{id}`, a nie do osobnego magazynu Payloada.
- AC2: Given plik został wgrany, When sprawdzam wiersz `media`, Then `file_id` wskazuje rekord storage'u boilerplate'u, objęty tą samą polityką retencji i tym samym jobem `storage.purge`.
- AC3: Given usuwam media, When operacja się kończy, Then stosowany jest soft delete — plik nie znika natychmiast, spójnie z EPIK 20 spec.

### EPIK C4 — Bloki per tenant

**US-C4.1** Jako właściciel platformy, chcę, aby blok custom był widoczny wyłącznie w akademii, której go nadałem.

- AC1: Given blok `X` jest zarejestrowany w kodzie, ale akademia A nie ma wiersza w `tenant_block_access`, When admin akademii A otwiera edytor strony, Then blok `X` nie jest dostępny na liście bloków.
- AC2: Given nadaję akademii A dostęp do bloku `X`, When admin akademii A odświeża edytor, Then blok `X` jest dostępny, a `granted_by_user_id`/`granted_at` odnotowują, kto i kiedy go nadał.
- AC3: Given akademia B nie ma nadanego bloku `X`, When jej admin próbuje zapisać stronę zawierającą ten blok bezpośrednio przez API, Then zapis jest odrzucany na backendzie — widoczność w edytorze nie jest jedyną bramką.
- AC4: Given nadanie dostępu do bloku jest operacją ręczną, When sprawdzam, czy zależy od planu organizacji, Then nie zależy — `plan_feature_flag` (EPIK 29 spec) nie jest w to wpięty na tym etapie.
- AC5: Given blok custom bez grantu jest zagnieżdżony głębiej w drzewie `blocks` (np. wewnątrz `Column` wewnątrz `Grid`), When admin próbuje zapisać taką stronę, Then zapis jest odrzucany na backendzie tak samo jak przy braku grantu na top-level — walidacja przechodzi **cały** zagnieżdżony drzewostan, nie tylko płytki poziom tablicy (§1.3).

**US-C4.2** Jako właściciel platformy, chcę, aby bloki core były zawsze dostępne w edytorze każdej akademii, bez potrzeby jawnego nadania.

- AC1: Given blok `Y` jest jednym z core (`Grid`, `Column`, `Text`, `Button`, `Image`, `Separator`, `Accordion`), When admin dowolnej akademii otwiera edytor strony, Then blok `Y` jest dostępny na liście bloków niezależnie od tego, czy istnieje wiersz w `tenant_block_access` dla tej akademii.
- AC2: Given admin zapisuje stronę zawierającą wyłącznie bloki core, When zapis dociera do backendu, Then nigdy nie jest odrzucany z powodu braku grantu — core bloki nie podlegają bramce `tenant_block_access` (§2.6).

### EPIK C5 — Motywy i stylowanie

**US-C5.1** Jako Owner lub Admin akademii, chcę ustawić motyw mojej witryny (fonty, kolory), aby jej wygląd odpowiadał marce akademii.

- AC1: Given mam uprawnienie `cms.manage`, When zapisuję `theme` z fontem głównym, fontem nagłówkowym, kolorem primary i kolorem secondary, Then powstaje lub aktualizuje się dokładnie jeden wiersz `theme` dla mojej organizacji (`organization_id` unikalne 1:1).
- AC2: Given `theme` mojej akademii jest zapisany, When otwieram publiczną stronę pod moją subdomeną, Then wartości motywu są wstrzyknięte jako zmienne CSS do `:root` (§2.8) i widoczne w wyrenderowanej stronie.
- AC3: Given nie mam uprawnienia `cms.manage`, When próbuję zapisać `theme` bezpośrednio przez API, Then zapis jest odrzucany na backendzie, niezależnie od tego, co pokazuje UI — spójnie z `US-C2.1`/AC3.
- AC4: Given akademia B nie ma jeszcze zapisanego `theme`, When ktokolwiek otwiera jej publiczną stronę, Then renderuje się z rozsądnymi wartościami domyślnymi — brak wiersza `theme` nie jest błędem.

---

## 4. Rozstrzygnięte decyzje

| #   | Punkt                                                                  | Decyzja                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Czy Payload ma własną bazę, czy współdzieli instancję z aplikacją SaaS | **Współdzieli jedną instancję PostgreSQL** — bez synchronizacji przez webhooki/API. Tabele CMS (`page`, `media`, `tenant_block_access`) współistnieją z tabelami domenowymi. Dwie bazy oznaczałyby warstwę synchronizacji, która sama w sobie jest źródłem rozjazdu, przy zerowej korzyści dla produktu tej skali.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2   | Jak realizowana jest izolacja tenantowa w Payloadzie                   | **RLS jako druga linia obrony**, tym samym wzorcem co reszta aplikacji: `organization_id` na każdej tabeli CMS, polityki analogiczne do migracji `0015`–`0017` modułu głównego. Payload nie ustawia kontekstu RLS automatycznie — wymaga custom hooka (`beforeOperation` lub analogiczny) ustawiającego kontekst tenanta na każde zapytanie Payloada. Patrz §2.2 (uwaga o `set_config` zamiast `SET LOCAL`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | Czy Payload ma własną tożsamość użytkownika dla personelu              | **Nie — pełne SSO.** Custom Payload auth strategy waliduje sesję Better Auth bezpośrednio; Payload nie ma równoległej tożsamości personelu. Panel CMS żyje pod tą samą subdomeną co reszta panelu akademii (spec §2.27), więc cookie sesji nie wymaga scope'u wildcard — jest scoped do konkretnego hosta akademii.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | Zakres uprawnienia do edycji stron                                     | **Nowe uprawnienie `cms.manage` w statycznej mapie RBAC, przypisane Owner/Admin.** Uzasadnienie niezależne: zarządzanie treścią publicznej strony akademii jest zadaniem operacyjnym/marketingowym, nie decyzją właścicielską jak dostęp do konta bankowego — stąd zakres **szerszy** niż `billing_connect.manage` (wyłącznie Owner, spec §2.10), a nie ten sam wzorzec. Recepcja i Trener nie mają dostępu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | Adresowanie modułu                                                     | **Wszystko pod `{organization.subdomain}.langlion.pl`** — publiczna strona, dashboard (`/dashboard`) i panel CMS (`/admin`). Onboarding nowej akademii, marketing produktu i panel Super Admina zostają na `langlion.pl`. Patrz spec §2.27 (rewizja 15.1) — moduł nie definiuje własnego routingu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | Mechanizm uploadów                                                     | **Custom `StorageAdapter` zgodny z interfejsem Payloada, wołający wewnątrz istniejący adapter S3-compatible boilerplate'u (§21).** Payload NIE używa własnego/natywnego mechanizmu uploadów. Jeden bucket, jedna polityka retencji, ten sam wzorzec prefiksu izolacji `org/{id}`, który obowiązuje już dla `policy_document.file_id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | Jak rozstrzygana jest dostępność bloków custom per akademia            | **Nowa tabela `tenant_block_access`** (`organization_id`, `block_key`, `granted_at`, `granted_by_user_id`) — blok zarejestrowany w kodzie jest widoczny w edytorze konkretnej akademii wyłącznie przy istniejącym, pasującym wierszu. Sprawdzane rekursywnie, na każdym poziomie zagnieżdżenia `blocks`, przy renderowaniu funkcyjnej konfiguracji pola `blocks` na podstawie tenanta z requestu. Nadawanie ręczne, analogicznie do `client_price_override`/`credits.manual_grant` w spec. **Rewizja v2 (świadoma zmiana kierunku względem wersji 1):** każdy custom blok/sekcja dostaje w rejestrze kodu opcjonalny `feature_key` — przygotowana furtka pod `plan_feature_flag` (EPIK 29 spec). To **przygotowanie furtki, nie aktywacja różnicowania planowego**: widoczność nadal wyłącznie przez `tenant_block_access`, `plan_feature_flag` pozostaje fail-open dla bloków (brak wpisu niczego nie blokuje, w kontraście do fail-closed dla reszty SaaS, spec §2.21). Uzasadnienie zmiany: przygotowanie kosztuje jedno pole w rejestrze kodu dziś, a odłożenie aktywacji nie wymaga żadnej zmiany schematu — tańsze niż dopisywanie furtki retrospektywnie, gdy pojawi się pierwszy blok sprzedawany planowo. |
| 8   | Slug strony głównej akademii                                           | **Pusty (`""`)** — strona główna renderuje się pod gołym `{organization.subdomain}.langlion.pl`, bez dodatkowego członu ścieżki. Odrzucone `home`: wymuszałoby albo przekierowanie `/` → `/home` (dodatkowy skok na najczęściej odwiedzanym adresie witryny), albo osobną regułę w middleware mapującą pustą ścieżkę na zarezerwowaną nazwę — czyli wyjątek dokładnie tam, gdzie reszta rozstrzygania jest jednolita. Pusty slug jest zwykłym wierszem `page` i przechodzi tą samą ścieżką co każda inna strona. Konsekwencje: `""` jest wartością dopuszczalną w walidacji slugu (nie myli się z brakiem wartości — kolumna pozostaje `NOT NULL`), unikalność `(organization_id, slug)` gwarantuje najwyżej jedną stronę główną per akademia, a akademia bez strony o pustym slugu zwraca 404 pod gołą subdomeną, tym samym mechanizmem co każdy inny niedopasowany adres. |
| 9   | Core vs custom bloki                                                   | **Rozróżnienie na poziomie mechanizmu widoczności, nie schematu.** Core: `Grid`, `Column` (kontenery layoutu), `Text`, `Button`, `Image`, `Separator`, `Accordion` (atomy UI) — dostępne domyślnie dla każdej akademii, bez wpisu w `tenant_block_access`. Custom/sekcje: wszystko poza tą listą, wymagają grantu jak dotąd. Uzasadnienie: bez core bloków nie da się złożyć żadnej strony — wymaganie grantu na `Text`/`Button` blokowałoby start każdej akademii od zera. To świadome **zawężenie** Zasady nadrzędnej #3 do bloków spoza listy core, nie jej cofnięcie. Lista core (w tym `Accordion`) potwierdzona z product ownerem. |
| 10  | Mapowanie stylowania: słownik w kodzie, nie klasy w bazie              | **Edytor Payload eksponuje wyłącznie predefiniowane opcje (dropdown), nigdy pole na klasy CSS.** Next.js tłumaczy zapisany parametr (np. `size: "large"`) przez słownik zdefiniowany w kodzie na klasy Tailwind, w momencie renderowania. Uzasadnienie: zmiana wyglądu elementu globalnie w całym SaaS staje się jedną zmianą w słowniku kodu, zero migracji, zero dotykania zapisanych stron — odwrotność sytuacji, w której klasy Tailwind zapisane w `jsonb` wymagałyby migracji danych przy każdej zmianie designu. |
| 11  | `theme` jako własna kolekcja Payload, nie Payload Global                | **Nowa tabela `theme`** (`organization_id` unikalne 1:1, fonty, kolory), RLS tym samym wzorcem `*_tenant_isolation`/`*_system_bypass` co pozostałe tabele CMS. Uzasadnienie: Payload Globals nie są tenant-scoped z natury — naiwna implementacja jako Global dałaby jeden wspólny motyw wszystkim akademiom w SaaS, co jest sprzeczne z Zasadą nadrzędną #2 (izolacja tenantowa). Analogia do decyzji #2 (custom hook RLS): wszędzie, gdzie Payload oferuje mechanizm nieliczący się z tenancją, trzeba go świadomie ominąć. |
| 12  | Uprawnienie do edycji `theme`                                          | **`cms.manage` (Owner, Admin)** — bez nowego wpisu w RBAC (spec §2.10). Uzasadnienie: ustawianie motywu (fonty, kolory) jest tą samą kategorią zadania operacyjnego/marketingowego co edycja stron i mediów (§2.4, decyzja #4), nie decyzją właścicielską wymagającą węższego kręgu jak `billing_connect.manage`. Potwierdzone z product ownerem. |

---

## 5. Otwarte punkty — do rozstrzygnięcia przy implementacji

| #   | Punkt                                                                                                                                                                           | Status                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Czy Payload `versions`/`drafts` (wersjonowanie stron, draft vs publish) jest włączone w MVP, czy `status` na `page` wystarcza bez pełnego mechanizmu wersji                     | Kolumna `status` pokrywa samo rozróżnienie draft/published; pełny mechanizm wersji dokłada historię i podgląd wersji roboczej opublikowanej strony. Do rozstrzygnięcia przed implementacją edytora — wpływa na kształt `page`, więc lepiej rozstrzygnąć przed migracją niż po.                                                                                      |
| 2   | Bloki custom startowe do zaimplementowania w MVP (nazywane „Core Blocks" w pierwotnym briefie — **uwaga terminologiczna**: to były przykładowe bloki custom, nie core w sensie §2.6/§4 decyzja #9, gdzie „core" oznacza dziś wyłącznie `Grid`/`Column`/`Text`/`Button`/`Image`/`Separator`/`Accordion`) | Poza `HeroSection`/`PricingTable`/`ContactForm`/`ScheduleGrid` z pierwotnego briefu — co dokładnie wchodzi jako pierwsze bloki custom wymagające grantu. Nie blokuje modelu danych ani routingu; blokuje wycenę pracy nad edytorem.                                                                                                                                                                              |
| 3   | Czy `ScheduleGrid` czyta dane przez ten sam mechanizm co reszta zapytań RLS-owanych (wymaga ustawienia kontekstu tenanta), czy przez dedykowany, cache'owany endpoint publiczny | Ruch publiczny ma inny profil wydajności niż panel: strona akademii może dostać ruch kampanijny, a grafik zmienia się rzadko. Cache'owany endpoint jest tańszy, ale wprowadza drugą ścieżkę odczytu danych domenowych — a każda druga ścieżka to drugie miejsce, w którym izolacja tenantowa może się rozjechać. Do rozstrzygnięcia przed implementacją tego bloku. |
| 4   | Moment i sposób faktycznej aktywacji różnicowania planowego bloków custom przez `plan_feature_flag`                                                                             | `feature_key` jest dziś przygotowaną, nieaktywną furtką (§2.6, §4 decyzja #7) — mechanizm planowy jest fail-open, żaden blok nie jest różnicowany planem. Aktywacja (dopisanie wierszy do `plan_feature_flag` dla konkretnych par plan/`feature_key`) nastąpi dopiero, gdy pojawi się pierwszy blok custom sprzedawany planowo — nie dziś, nie rozstrzygane w tej wersji dokumentu.                          |

---

## 6. Odłożone poza MVP

- **Domeny własne akademii przez CNAME** — witryna docelowo ma żyć pod własną domeną klienta, nie tylko pod subdomeną `langlion.pl` (spec §2.27). Wymaga wildcard DNS/TLS i weryfikacji własności domeny. Odnotowane jako kierunek, nie projektowane teraz.
- **Aktywacja różnicowania planowego bloków custom** (`plan_feature_flag`, EPIK 29 spec) — `tenant_block_access` celowo pozostaje jedynym mechanizmem rozstrzygającym widoczność (decyzja #7). Furtka w schemacie/rejestrze (`feature_key` na custom bloku) **już istnieje od wersji 2 tego dokumentu, ale jest nieaktywna** — mechanizm planowy jest dziś fail-open. Gdyby bloki zaczęły być sprzedawane planowo, aktywacja polega wyłącznie na dopisaniu wierszy do `plan_feature_flag`, bez zmiany schematu czy kodu bloków (§5, punkt #4).
- **Podgląd strony przed publikacją (preview)** — zależny od rozstrzygnięcia punktu 1 (`versions`/`drafts`).
- **Analityka ruchu na stronach akademii** — brak jakiegokolwiek zbierania danych o odwiedzinach w MVP.

---

**Koniec dokumentu.**
