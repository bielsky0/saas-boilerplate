# Specyfikacja techniczna: Next.js SaaS Boilerplate

> **Uwaga (2026-07-19):** ten plik przywraca oryginalną treść specyfikacji boilerplate'u, która wcześniej żyła w `docs/specyfikacja.md`, zanim ten plik został podmieniony na specyfikację domeny langlion. Odwołania „boilerplate §X" w `docs/specyfikacja.md` i `docs/ARCHITECTURE.md` wskazują na sekcje TEGO dokumentu. Stan faktycznej implementacji względem tej specyfikacji opisuje `docs/plan-implementacji.md` (sekcja „Stan na start").

**Wersja:** 1.0
**Cel dokumentu:** Kompletna specyfikacja funkcjonalna i techniczna do przekazania zespołowi deweloperskiemu. Dokument opisuje działanie każdego modułu, model danych na poziomie koncepcyjnym, przepływy (flow), reguły biznesowe i przypadki brzegowe. Nie zawiera kodu — jest podstawą do implementacji i wyceny.

---

## 1. Założenia ogólne i stack

### 1.1 Stack technologiczny

- **Framework:** Next.js (App Router), React, TypeScript w trybie strict
- **Stylowanie:** Tailwind CSS + biblioteka komponentów (typu shadcn/ui) jako headless UI + tokeny stylów
- **Baza danych:** relacyjna (PostgreSQL) z ORM (Drizzle lub Prisma) — wybór ORM musi być izolowany w warstwie dostępu do danych, tak by dało się go podmienić bez zmiany logiki biznesowej
- **Autoryzacja/sesje:** dostawca auth (np. Better Auth / Supabase Auth / NextAuth) — również izolowany za wspólnym interfejsem
- **Kolejki/background jobs:** dedykowany scheduler (np. Inngest lub odpowiednik) do zadań asynchronicznych i cyklicznych
- **Płatności:** warstwa abstrakcji nad dostawcami (Stripe jako referencyjny, z możliwością dodania Lemon Squeezy, Paddle, PayPal, Dodo, Polar)
- **Email:** warstwa abstrakcji nad dostawcami transakcyjnymi (Resend/SES/Mailgun/SMTP)
- **Hosting:** Vercel jako target podstawowy, z możliwością działania na Node.js standalone (serverful) — żadna funkcjonalność nie może zakładać wyłącznie środowiska serverless

### 1.2 Zasada architektoniczna: brak vendor lock-in

Każda integracja zewnętrzna (auth, DB, płatności, email, storage) musi być schowana za wewnętrznym interfejsem/kontraktem (adapter pattern). Reszta aplikacji komunikuje się wyłącznie z tym interfejsem, nigdy bezpośrednio z SDK dostawcy. Podmiana dostawcy = podmiana jednego adaptera, zero zmian w logice biznesowej i UI.

### 1.3 Model wielodostępności (multi-tenancy)

Aplikacja musi wspierać dwa konteksty pracy użytkownika:

- **Konto osobiste (personal account):** przestrzeń danych należąca do pojedynczego użytkownika, tworzona automatycznie przy rejestracji
- **Organizacja (team account):** przestrzeń współdzielona przez wielu użytkowników z rolami

Użytkownik może należeć do wielu organizacji jednocześnie i przełączać się między nimi (context switcher). Każdy rekord danych biznesowych (nie tylko systemowych) musi być przypisany do dokładnie jednego „właściciela kontekstu" (personal account ID lub organization ID) — to jest klucz izolacji danych (tenant isolation). Wszystkie zapytania do bazy muszą być filtrowane po tym kluczu na poziomie warstwy dostępu do danych (nie tylko w UI), najlepiej wspierane dodatkowo politykami bezpieczeństwa na poziomie wiersza (row-level security), jeśli baza to obsługuje.

### 1.4 Konfigurowalne wyłączenie multi-tenancy

**Cel:** pozwolić produktom budowanym na tym boilerplate, które nie potrzebują organizacji (czyste B2C), wyłączyć tę warstwę bez przepisywania fundamentu.

- Flaga konfiguracyjna na poziomie aplikacji (np. zmienna środowiskowa `MULTI_TENANCY_MODE` z wartościami `required` / `optional` / `disabled`), czytana raz przy starcie aplikacji
- **`required`** (domyślne dla tego boilerplate'u): zachowanie zgodne z sekcjami 3-4 w całości — user musi mieć dostęp przez organizację albo personal account, oba konteksty widoczne
- **`optional`**: organizacje istnieją i działają, ale UI nie zmusza użytkownika do wyboru — personal account jest domyślnym kontekstem, tworzenie organizacji jest dostępne, ale nieeksponowane w głównym flow
- **`disabled`**: UI tworzenia/zarządzania organizacjami jest całkowicie ukryte (nawigacja, przełącznik kontekstu, zaproszenia), personal account staje się jedynym kontekstem dla każdego użytkownika

**Ważne ograniczenie architektoniczne:** ta flaga jest **wyłącznie kosmetyczna/UI**, nie zmienia modelu danych. Każdy rekord biznesowy nadal ma `organization_id` lub `account_id` zgodnie z sekcją 1.3 — `disabled` oznacza tylko, że aplikacja nigdy nie tworzy organizacji ani nie pokazuje ich w interfejsie, nie że warstwa dostępu do danych przestaje wspierać ten model. Dzięki temu przełączenie trybu w przyszłości (np. produkt czysto B2C zaczyna jednak potrzebować zespołów) nie wymaga migracji danych, tylko odkrycia już istniejącego UI.

---

## 2. Autentykacja

### 2.1 Rejestracja i logowanie e-mail/hasło

- Formularz rejestracji: e-mail, hasło (z regułą minimalnej złożoności: min. 8 znaków, wymagana litera + cyfra), opcjonalnie imię
- Hasła przechowywane wyłącznie jako hash (bcrypt/argon2), nigdy plain text ani w logach
- Po rejestracji: wysyłka e-maila weryfikacyjnego z linkiem jednorazowym (token z czasem wygaśnięcia, np. 24h)
- Konto nieaktywowane (brak weryfikacji e-mail) ma ograniczony dostęp — dokładny zakres ograniczeń do ustalenia per produkt (np. brak dostępu do funkcji płatnych, banner z przypomnieniem)
- Logowanie: e-mail + hasło, z rate-limitingiem prób logowania (np. blokada po 5 nieudanych próbach na adres IP/konto w oknie czasowym, z komunikatem zwrotnym niezdradzającym czy e-mail istnieje w systemie — ochrona przed enumeracją kont)
- Reset hasła: formularz „zapomniałem hasła" → e-mail z linkiem jednorazowym (token wygasający, np. 1h) → formularz ustawienia nowego hasła → invalidacja wszystkich aktywnych sesji użytkownika po zmianie hasła

### 2.2 Magic Link (logowanie bezhasłowe)

- Użytkownik podaje e-mail → system generuje jednorazowy token z krótkim czasem życia (np. 15 min) → wysyła link → kliknięcie linku loguje użytkownika i unieważnia token
- Token musi być jednorazowy (użycie = natychmiastowa invalidacja, nawet jeśli nie wygasł)
- Jeśli e-mail nie istnieje w systemie: do ustalenia biznesowo, czy magic link automatycznie zakłada konto, czy zwraca błąd — musi być jawnie zdefiniowane w logice, nie domyślne zachowanie biblioteki

### 2.3 OAuth / Social Login

- Obsługa dostawców: Google, GitHub (minimum), z architekturą pozwalającą dodać kolejnych (Facebook, X, Discord) bez zmian strukturalnych
- Flow: standardowy OAuth2 Authorization Code flow z redirect
- Powiązanie kont: jeśli e-mail zwrócony przez dostawcę OAuth pokrywa się z istniejącym kontem założonym przez e-mail/hasło — system musi mieć jawną politykę: albo automatyczne łączenie kont (po weryfikacji, że e-mail jest zweryfikowany przez dostawcę), albo blokada z komunikatem, nigdy ciche tworzenie duplikatu konta
- Jeden użytkownik może mieć podpiętych wiele metod logowania (e-mail/hasło + Google + GitHub) do tego samego konta

### 2.4 Multi-Factor Authentication (MFA/TOTP)

- Użytkownik włącza MFA w ustawieniach konta: system generuje sekret TOTP + kod QR do zeskanowania w aplikacji authenticator
- Po dodaniu: wymagane potwierdzenie jednym poprawnym kodem przed aktywacją (żeby nie zablokować sobie konta błędną konfiguracją)
- Generowanie kodów zapasowych (recovery codes) — jednorazowych, do użycia gdy użytkownik straci dostęp do aplikacji authenticator; muszą być pokazane raz i zapisane w formie zahashowanej
- Logowanie z MFA: po poprawnym haśle/magic linku, drugi krok żądający kodu TOTP lub recovery code
- Możliwość wymuszenia MFA na poziomie organizacji przez administratora (enterprise requirement)

### 2.5 Sesje i bezpieczeństwo

- Sesje przechowywane server-side (nie sam JWT bez możliwości rewokacji) lub JWT z krótkim TTL + refresh token z możliwością unieważnienia
- Użytkownik musi mieć widok „aktywne sesje/urządzenia" z możliwością wylogowania zdalnego
- Middleware chroniący trasy: każda trasa aplikacji (poza jawnie publicznymi) wymaga ważnej sesji; przekierowanie do logowania z zachowaniem docelowego URL (redirect-back po zalogowaniu)
- Ochrona API routes tym samym middlewarem — nie tylko stron

### 2.7 Passkeys (WebAuthn/FIDO2)

**Cel:** metoda logowania odporna na phishing, bez hasła i bez zależności od dostępu do skrzynki e-mail (w przeciwieństwie do magic linka).

- Rozszerzenie istniejącego adaptera auth (sekcja 2, cała reszta specyfikacji trzyma się zasady braku vendor lock-in z sekcji 1.2) — passkeys implementowane jako kolejna metoda logowania za tym samym kontraktem, nie osobny, równoległy system
- Rejestracja passkey: użytkownik (zalogowany już inną metodą, np. e-mail/hasło) w ustawieniach konta inicjuje dodanie klucza — przeglądarka/system operacyjny prosi o biometrię/PIN urządzenia, publiczny klucz zapisywany po stronie serwera, prywatny nigdy nie opuszcza urządzenia użytkownika
- Logowanie przez passkey: użytkownik wybiera tę opcję na ekranie logowania zamiast podawać e-mail/hasło, przeglądarka komunikuje się z uwierzytelnionym urządzeniem, serwer weryfikuje podpis kryptograficzny
- Użytkownik może mieć wiele zarejestrowanych passkeys (np. telefon + laptop), z widokiem zarządzania w ustawieniach (nazwa urządzenia, data dodania, data ostatniego użycia, możliwość odwołania pojedynczego klucza)
- Passkeys współistnieją z innymi metodami logowania z sekcji 2 (nie zastępują ich) — użytkownik może mieć jednocześnie hasło, OAuth i passkey podpięte do tego samego konta

---

## 3. Multi-tenancy / Organizacje

### 3.1 Struktura danych

- Encja `Organization`: nazwa, slug (unikalny identyfikator w URL), logo, data utworzenia, właściciel
- Encja `Membership`: powiązanie użytkownik ↔ organizacja ↔ rola, ze statusem (aktywny/zaproszony/zawieszony)
- Każdy użytkownik ma dokładnie jedno konto osobiste (personal) i może mieć N członkostw w organizacjach

### 3.2 Tworzenie organizacji

- Formularz: nazwa organizacji → automatyczne wygenerowanie sluga (z możliwością edycji, walidacja unikalności)
- Twórca organizacji automatycznie otrzymuje rolę najwyższego uprawnienia (Owner)
- Organizacja musi mieć zawsze co najmniej jednego Ownera — system musi blokować akcję usunięcia/degradacji ostatniego Ownera

### 3.3 Zaproszenia do zespołu

- Owner/Admin wysyła zaproszenie: e-mail zapraszanego + wybrana rola
- System generuje token zaproszenia (jednorazowy, z czasem wygaśnięcia np. 7 dni) i wysyła e-mail z linkiem
- Scenariusze akceptacji zaproszenia:
  - Zaproszony ma już konto w systemie → po zalogowaniu i kliknięciu linku od razu dołącza do organizacji
  - Zaproszony nie ma konta → link prowadzi do rejestracji, po zakończeniu rejestracji automatycznie dołącza do organizacji z przypisaną rolą
- Lista oczekujących zaproszeń widoczna dla adminów, z możliwością cofnięcia (revoke) niewykorzystanego zaproszenia
- Zaproszenie nie powinno ujawniać, czy dany e-mail już ma konto w systemie (ochrona prywatności)

### 3.4 Zarządzanie członkami

- Widok listy członków organizacji z rolami i statusem
- Zmiana roli członka (z wyjątkiem ostatniego Ownera — patrz 3.2)
- Usunięcie członka z organizacji (natychmiastowa utrata dostępu do zasobów organizacji, ale nie usunięcie jego konta użytkownika w systemie)
- Opcjonalnie: możliwość, by użytkownik samodzielnie opuścił organizację (z tym samym ograniczeniem dot. ostatniego Ownera)

### 3.5 Przełącznik kontekstu (account switcher)

- Element UI dostępny globalnie (np. w navbarze), pokazujący konto osobiste + wszystkie organizacje użytkownika
- Przełączenie kontekstu zmienia „aktywny tenant" dla bieżącej sesji — wszystkie kolejne zapytania do danych filtrowane są po nowym kontekście
- URL-e aplikacji powinny odzwierciedlać kontekst organizacji (np. przez slug w ścieżce), żeby dało się bezpośrednio linkować do zasobu konkretnej organizacji i żeby odświeżenie strony zachowywało kontekst

---

## 4. RBAC (Role-Based Access Control)

### 4.1 Model ról i uprawnień

- Role predefiniowane minimum: Owner, Admin, Member (z możliwością rozszerzenia o role custom w wersji zaawansowanej)
- Każda rola to zestaw uprawnień (permissions) — uprawnienia to atomowe akcje (np. `billing.manage`, `members.invite`, `members.remove`, `settings.edit`, `content.create`, `content.delete`)
- Definicja uprawnień per rola musi być scentralizowana w jednym miejscu (mapa rola → lista uprawnień), nie rozproszona po komponentach

### 4.2 Egzekwowanie uprawnień

- **Poziom backendu (obowiązkowy):** każda akcja API/serwerowa modyfikująca dane musi sprawdzać, czy użytkownik ma wymagane uprawnienie w kontekście aktywnej organizacji, zanim wykona operację. To jest jedyne źródło prawdy dla bezpieczeństwa.
- **Poziom UI (kosmetyczny):** elementy interfejsu (przyciski, linki) dla akcji, do których użytkownik nie ma uprawnień, powinny być ukryte lub zablokowane — wyłącznie dla UX, nigdy jako jedyne zabezpieczenie
- Próba wykonania nieautoryzowanej akcji przez API (np. przez bezpośrednie wywołanie) musi zwracać błąd 403 z jasnym komunikatem

### 4.3 Role custom (rozszerzenie)

- Możliwość zdefiniowania przez organizację własnych ról z dowolnym zestawem uprawnień z dostępnej puli
- Wymaga UI do zarządzania rolami (tworzenie, edycja, przypisywanie do członków) oraz walidacji, że nie da się usunąć roli, która jest aktualnie przypisana do aktywnych członków (albo wymuszenie przepięcia ich na inną rolę przed usunięciem)

---

## 5. Billing i płatności

### 5.1 Warstwa abstrakcji nad dostawcami

- Wspólny interfejs dla operacji: utworzenie klienta płatności, utworzenie subskrypcji, aktualizacja subskrypcji, anulowanie, pobranie faktur, obsługa webhooków
- Dostawca referencyjny: Stripe. Struktura musi pozwalać dodać kolejnego dostawcę (Lemon Squeezy, Paddle, PayPal, Dodo, Polar) przez implementację tego samego interfejsu, bez zmian w logice aplikacji korzystającej z billingu

### 5.2 Plany i ceny

- Definicja planów (nazwa, cena, okres rozliczeniowy, limity/quota, lista uprawnień/features odblokowywanych) trzymana w konfiguracji aplikacji, nie hardkodowana w UI — zmiana ceny w konfiguracji ma automatycznie odzwierciedlić się w tabeli cenowej
- Wsparcie modeli: subskrypcja flat-rate (stała cena), per-seat (cena × liczba miejsc/użytkowników), usage-based/metered (cena zależna od zużycia zgłaszanego do dostawcy płatności), jednorazowa płatność (one-time purchase)
- Powiązanie planu z organizacją LUB z kontem osobistym — zależnie od modelu produktu (B2B vs B2C), architektura musi wspierać oba

### 5.3 Checkout

- Inicjacja płatności przekierowuje użytkownika do hostowanej strony checkout dostawcy (np. Stripe Checkout) — nie budujemy własnego formularza kart (redukcja zakresu PCI-DSS)
- Po sukcesie: redirect na stronę potwierdzenia w aplikacji + webhook od dostawcy jako właściwe źródło prawdy o aktywacji subskrypcji (redirect użytkownika NIE może być jedynym mechanizmem aktywacji dostępu — użytkownik może zamknąć kartę przed redirectem)

### 5.4 Webhooki

- Endpoint webhook musi weryfikować podpis żądania (signature verification) dla każdego eventu, odrzucać niepodpisane/niepoprawne żądania
- Obsługiwane eventy minimum: utworzenie subskrypcji, aktualizacja subskrypcji (zmiana planu), anulowanie subskrypcji, nieudana płatność, odnowienie subskrypcji, zwrot płatności
- Przetwarzanie webhooków musi być idempotentne — ten sam event dostarczony wielokrotnie (dostawcy nie gwarantują dostawy dokładnie raz) nie może powodować duplikatów w bazie ani podwójnego naliczenia
- Stan subskrypcji w bazie aplikacji jest zawsze wynikiem przetworzenia webhooka, nigdy zgadywany po stronie klienta

### 5.5 Customer Portal

- Link do hostowanego przez dostawcę portalu, gdzie użytkownik samodzielnie: zmienia metodę płatności, pobiera faktury, zmienia/anuluje plan
- Aplikacja musi zsynchronizować stan po zmianach dokonanych w portalu — ponownie przez webhooki, nie przez odpytywanie API przy każdym wejściu

### 5.6 Quota i limity planu

- Każdy plan definiuje limity (np. liczba projektów, liczba wywołań API, liczba miejsc w zespole)
- Mechanizm sprawdzania limitu musi być wywoływany przed wykonaniem akcji podlegającej limitowi (nie po fakcie) — blokada z czytelnym komunikatem i CTA do upgrade'u planu, gdy limit przekroczony
- Licznik zużycia musi być inkrementowany atomowo (ochrona przed race condition przy równoczesnych żądaniach zbliżających się do limitu)

### 5.7 Plan-based rendering

- Warstwa (hook/serwis) zwracająca informację o aktualnym planie i jego uprawnieniach, wykorzystywana zarówno do warunkowego renderowania UI (np. ukrycie/zablokowanie funkcji premium), jak i do egzekwowania po stronie backendu (to drugie jest obowiązkowe, pierwsze kosmetyczne — analogicznie do RBAC w sekcji 4.2)

---

## 6. Panel administracyjny (Super Admin)

### 6.1 Dostęp

- Osobna flaga na koncie użytkownika (np. `isSuperAdmin`), niezależna od ról w organizacjach — super admin to rola systemowa, nie organizacyjna
- Panel dostępny pod wydzieloną ścieżką, z dodatkowym middlewarem sprawdzającym flagę super admina niezależnie od standardowej autentykacji

### 6.2 Funkcje

- Lista wszystkich użytkowników systemu z wyszukiwaniem/filtrowaniem (e-mail, data rejestracji, status)
- Lista wszystkich organizacji z podstawowymi metrykami (liczba członków, plan, MRR jeśli dotyczy)
- Podgląd szczegółów konta użytkownika/organizacji
- **Impersonacja:** możliwość zalogowania się „jako" wybrany użytkownik w celu debugowania/wsparcia — musi być jawnie oznaczona w UI (banner „jesteś zalogowany jako X w trybie admina") i logowana w audit logu (kto, kiedy, kogo impersonował)
- Zawieszenie/odblokowanie konta użytkownika
- Usunięcie konta użytkownika/organizacji — z potwierdzeniem i (jeśli wymaga tego produkt) miękkim usunięciem (soft delete) z okresem retencji przed trwałym usunięciem danych

### 6.3 Audit log

- Rejestrowanie krytycznych akcji administracyjnych (impersonacja, zmiana roli, usunięcie konta, zmiana planu z poziomu admina) z timestampem, wykonawcą i celem akcji

### 6.4 Pełny audit trail systemowy (rozszerzenie 6.3)

**Cel:** rozszerzenie audytu z „akcje super admina" na „wszystkie istotne zmiany danych w systemie" — bezpośrednio wzmacnia wymogi RODO (kto zmienił dane klienta i kiedy) i daje podstawę do rozliczalności poza samym panelem admina.

**Zakres zmian objętych audytem:**

- Każda operacja tworzenia/edycji/usunięcia rekordu w encjach uznanych za wrażliwe biznesowo (dane klientów/uczniów, dokumenty/umowy z sekcji o RODO, zmiany ról i uprawnień, zmiany planu/billingu) — nie każda operacja w systemie, tylko te jawnie oznaczone jako podlegające audytowi
- Zapis na poziomie pola: stara wartość → nowa wartość, nie tylko fakt „rekord X został zmieniony"

**Model wykonawcy (actor):**

- Rozróżnienie typu wykonawcy zmiany: `User` (zwykły użytkownik/pracownik organizacji), `SuperAdmin` (akcja z panelu administracyjnego, sekcja 6.3), `System` (zmiana wykonana automatycznie, np. przez background job albo webhook płatności), `AIAgent` (zmiana wykonana przez asystenta AI, jeśli moduł z sekcji 26 jest aktywny)
- Każdy wpis audytu zawiera: kto (typ wykonawcy + identyfikator), co (encja + pole), kiedy, z jakiego kontekstu (organizacja/tenant)

**Miejsce implementacji — jeden punkt, nie rozproszone wywołania:**

- Hook audytu musi siedzieć w warstwie dostępu do danych (ten sam punkt, który już egzekwuje tenant isolation z sekcji 11.2), nie być ręcznie wywoływany w każdym endpoincie osobno — to gwarantuje, że żadna nowa funkcja nie „zapomni" zalogować zmiany, bo mechanizm jest częścią samej warstwy zapisu, nie opt-in po stronie każdego dewelopera

**Eksport i retencja:**

- Eksport do CSV dla wybranej organizacji/zakresu czasowego, dostępny dla Ownera organizacji (nie tylko super admina) — przydatne przy audytach compliance po stronie klienta
- Retencja wpisów audytu zgodna z politykami retencji z sekcji 11.3, z uwzględnieniem, że sam log audytu może podlegać innym (zwykle dłuższym) wymogom przechowywania niż dane, których dotyczy

---

## 7. UI / Frontend

### 7.1 System designu

- Zestaw tokenów designu (kolory, typografia, spacing, promienie zaokrągleń) zdefiniowany centralnie i konsumowany przez wszystkie komponenty — zmiana motywu = zmiana tokenów, nie edycja każdego komponentu
- Biblioteka komponentów bazowych (przyciski, formularze, modale, tabele, karty, dropdowny, toasty/notyfikacje) budowana raz i reużywana w całej aplikacji

### 7.2 Dark/Light theme

- Przełącznik motywu dostępny globalnie, z trzema stanami: jasny / ciemny / zgodny z systemem operacyjnym
- Wybór motywu zapamiętywany per użytkownik (persystencja), bez migotania złego motywu przy pierwszym renderze strony (flash of unstyled/wrong theme)

### 7.3 Landing page

- Sekcje: hero, lista funkcji, cennik (dynamicznie generowany z konfiguracji planów — patrz 5.2), sekcja social proof/testimoniali, CTA
- Musi być w pełni responsywna i zoptymalizowana pod SEO (patrz sekcja 9)

### 7.4 Dashboard

- Layout z nawigacją boczną/górną, obszarem głównym na treść, uwzględniający aktywny kontekst (personal/organization) z sekcji 3.5
- Komponenty wizualizacji danych (wykresy) jako reużywalne bloki gotowe do podpięcia pod dane biznesowe konkretnego produktu

### 7.5 Responsywność

- Wszystkie widoki (landing, dashboard, formularze, tabele) muszą działać poprawnie na urządzeniach mobilnych — tabele z dużą ilością kolumn wymagają strategii dla mobile (np. widok kartowy zamiast tabeli) zdefiniowanej jawnie, nie pozostawionej przeglądarce

---

## 8. Blog / CMS treści

### 8.1 Model treści

- Treści (posty blogowe, strony dokumentacji) przechowywane jako pliki (np. MDX/Markdoc) w repozytorium LUB w bazie danych — decyzja architektoniczna do podjęcia na starcie, wpływa na to czy nietechniczni użytkownicy mogą edytować treść bez deploya
- Metadane posta: tytuł, slug, data publikacji, autor, opis (dla meta tagów), obraz okładkowy, tagi/kategorie, status (draft/published)

### 8.2 Generowanie stron

- Każdy opublikowany post generuje statyczną stronę pod przewidywalnym URL (np. `/blog/[slug]`)
- Automatyczne generowanie: sitemapy XML (aktualizowanej przy każdej publikacji), meta tagów (title, description, Open Graph, Twitter Card) na podstawie metadanych posta, structured data (JSON-LD) dla lepszej indeksacji

### 8.3 Dokumentacja/Help Center

- Analogiczna struktura do blogu, ale z nawigacją hierarchiczną (kategorie → podstrony) i wyszukiwarką po treści dokumentacji

### 8.4 Changelog

- Lista wpisów z datą i opisem zmian, generowana z tego samego mechanizmu treści co blog, dedykowany layout (grupowanie po wersjach/datach)

---

## 9. SEO

### 9.1 Wymagania techniczne

- Server-side rendering lub static generation dla wszystkich stron publicznych (landing, blog, dokumentacja) — SEO nie może polegać na treści renderowanej wyłącznie po stronie klienta
- Automatyczne generowanie `sitemap.xml` i `robots.txt`
- Każda strona publiczna musi mieć unikalny, dynamicznie generowany zestaw meta tagów (title, description, canonical URL, Open Graph, Twitter Card)
- Structured data (JSON-LD) dla typów treści, gdzie ma to sens (artykuł blogowy, organizacja, produkt/oferta)

---

## 10. System e-maili

### 10.1 Warstwa abstrakcji dostawcy

- Wspólny interfejs wysyłki (metoda `send(template, dane, odbiorca)`), z adapterami dla konkretnych dostawców (Resend, SES, Mailgun, SMTP) — analogicznie do warstwy billingu

### 10.2 Szablony

- Szablony budowane komponentowo (React), renderowane do HTML z fallbackiem tekstowym (plain text) dla klientów pocztowych bez obsługi HTML
- Minimalny zestaw szablonów: powitalny po rejestracji, weryfikacja e-mail, reset hasła, magic link, zaproszenie do organizacji, powiadomienie o nieudanej płatności, potwierdzenie subskrypcji

### 10.3 Sekwencje automatyczne (onboarding)

- Mechanizm zdarzeniowy: rejestracja użytkownika triggeruje zaplanowaną sekwencję e-maili (np. dzień 0: powitanie, dzień 3: tips, dzień 7: przypomnienie o funkcjach) realizowaną przez system background jobs (sekcja 12), z możliwością przerwania sekwencji jeśli użytkownik wykona określoną akcję (np. zasubskrybował plan płatny)
- Każdy e-mail marketingowy/onboardingowy musi zawierać link do rezygnacji (unsubscribe), z respektowaniem tej preferencji przy kolejnych wysyłkach

---

## 11. Baza danych

### 11.1 Wymagania ogólne

- Schemat bazy zarządzany przez system migracji (wersjonowane, odtwarzalne migracje, nie ręczne zmiany na produkcji)
- Wsparcie dla PostgreSQL jako baza referencyjna, z warstwą ORM umożliwiającą (w miarę możliwości) przełączenie się na inny provider hostingu Postgres (Neon, PlanetScale/MySQL-compatible, Supabase) bez zmian w logice zapytań

### 11.2 Izolacja danych (tenant isolation)

- Patrz sekcja 1.3 — każda tabela z danymi biznesowymi musi mieć kolumnę referencyjną do właściciela (organization_id lub account_id), indeksowaną, z egzekwowaniem filtracji na poziomie warstwy dostępu do danych
- Rekomendowane dodatkowe zabezpieczenie: row-level security na poziomie bazy (jeśli silnik wspiera), jako druga linia obrony niezależna od logiki aplikacji

### 11.3 Soft delete i retencja

- Kluczowe encje (użytkownik, organizacja, dane rozliczeniowe) powinny wspierać miękkie usuwanie (flaga `deletedAt`) zamiast trwałego usunięcia, z jasno zdefiniowanym okresem retencji i procesem trwałego czyszczenia (do zgodności z żądaniami usunięcia danych, np. RODO)

---

## 12. Background jobs

### 12.1 Zastosowania

- Zadania asynchroniczne niewymagające natychmiastowej odpowiedzi w request-response cyklu: wysyłka e-maili, sekwencje onboardingowe, przetwarzanie webhooków płatności, generowanie raportów, zadania AI (patrz 13), czyszczenie danych po okresie retencji

### 12.2 Wymagania

- Zadania muszą być idempotentne tam, gdzie to możliwe (ponowne wykonanie tego samego zadania nie powoduje efektów ubocznych typu podwójna wysyłka)
- Mechanizm retry z backoffem dla zadań, które mogą się nie powieść z przyczyn przejściowych (np. chwilowa niedostępność dostawcy e-mail)
- Zadania cykliczne (cron-like) dla operacji okresowych (np. codzienne czyszczenie wygasłych tokenów, cotygodniowe raporty)
- Widoczność/observability: możliwość podejrzenia statusu i historii wykonania zadań (przynajmniej w logach, docelowo w dedykowanym UI/panelu dostawcy)

---

## 13. Integracja AI SDK

### 13.1 Zakres

- Wspólna warstwa do wywoływania modeli AI (np. do generowania treści, streszczeń, sugestii) używana przez funkcje produktowe — nie jest to sam boilerplate „AI-native", ale przygotowana instalacja i konfiguracja SDK, gotowa do podpięcia konkretnego przypadku użycia
- Obsługa streamingu odpowiedzi do UI (tokeny pojawiające się progresywnie), obsługa błędów/limitów dostawcy modelu (rate limit, timeout) z czytelnym komunikatem dla użytkownika

### 13.2 Koszty i limity

- Wywołania AI powinny być powiązane z systemem quota (sekcja 5.6), jeśli funkcje AI mają być ograniczane per plan

---

## 14. Testy

### 14.1 E2E (Playwright)

- Zestaw testów end-to-end pokrywający krytyczne ścieżki: rejestracja, logowanie (wszystkie metody), tworzenie organizacji, zaproszenie członka, proces checkout/subskrypcji (na środowisku testowym dostawcy płatności), podstawowa nawigacja dashboardu
- Testy uruchamiane automatycznie w CI przy każdym pull requeście, blokujące merge w razie niepowodzenia

### 14.2 Jakość kodu

- TypeScript w trybie strict (brak `any` bez uzasadnienia, pełne typowanie danych z API i bazy)
- ESLint + Prettier z regułami wymuszanymi w CI (nie tylko lokalnie w edytorze)

---

## 15. Monitoring i observability

### 15.1 Error tracking

- Integracja z narzędziem typu Sentry: automatyczne przechwytywanie nieobsłużonych wyjątków po stronie klienta i serwera, z kontekstem (użytkownik, organizacja, akcja) o ile nie narusza to prywatności danych wrażliwych

### 15.2 Analytics produktowy

- Integracja z narzędziem typu PostHog: śledzenie kluczowych zdarzeń biznesowych (rejestracja, aktywacja, upgrade planu, kluczowe akcje produktowe) do analizy lejka konwersji

### 15.3 Logi/traceability

- Ustrukturyzowane logowanie zdarzeń serwerowych (nie `console.log`), z możliwością korelacji requestu (request ID) w całym cyklu życia żądania

---

## 16. Internacjonalizacja (i18n)

### 16.1 Wymagania

- Wszystkie teksty widoczne dla użytkownika (UI, e-maile, komunikaty błędów) wydzielone do plików tłumaczeń, nie hardkodowane w komponentach
- Mechanizm wykrywania/wyboru języka: automatyczna detekcja z przeglądarki jako domyślna, z możliwością ręcznej zmiany zapamiętywanej per użytkownik
- Struktura URL uwzględniająca język (np. prefiks `/en/`, `/pl/`) dla poprawnego indeksowania SEO w wielu językach
- Formaty dat, liczb i walut renderowane zgodnie z lokalizacją użytkownika

---

## 17. Reguły AI-assisted development (meta-wymaganie projektowe)

### 17.1 Cel

Kodebaza ma być zorganizowana w sposób ułatwiający pracę z asystentami AI (Cursor, Claude Code i podobne) — to wymaganie dotyczy struktury projektu, nie funkcji end-usera.

### 17.2 Konkretne wymagania

- Spójna, przewidywalna struktura katalogów (np. jasny podział na `features/`, `components/`, `lib/`, z jednym wzorcem nazewnictwa plików) — dokumentacja tego wzorca musi istnieć jako plik w repozytorium (np. plik z regułami dla asystentów AI), opisujący konwencje projektu (jak dodać nowy moduł, jak wygląda wzorzec CRUD w tym projekcie, gdzie żyje logika autoryzacji)
- Każdy powtarzalny wzorzec (np. „jak dodać nowy chroniony endpoint API", „jak dodać nową encję z tenant isolation") powinien mieć swój udokumentowany przykład referencyjny w kodzie, do którego można się odwołać

---

## 18. Pluginy dodatkowe

### 18.1 Testimoniale

- Formularz zgłaszania opinii przez użytkowników (tekst, ocena, zgoda na publikację) → kolejka moderacji (admin akceptuje/odrzuca) → publikacja na landing page

### 18.2 Feedback

- Widget dostępny w aplikacji (np. przycisk pływający) do zgłaszania uwag/błędów przez zalogowanych użytkowników, z automatycznym dołączeniem kontekstu technicznego (URL, przeglądarka, użytkownik) do zgłoszenia

### 18.3 Roadmap

- Publiczna lub prywatna lista planowanych funkcji z statusem (planowane/w trakcie/zrobione)

### 18.4 Wishlist / głosowanie na funkcje

- Użytkownicy mogą zgłaszać propozycje nowych funkcji (tytuł, opis)
- Inni użytkownicy mogą głosować na zgłoszone propozycje (jeden głos na użytkownika na propozycję, z możliwością cofnięcia głosu)
- Lista propozycji sortowalna po liczbie głosów
- Admin może zmieniać status propozycji (rozważane/zaakceptowane/odrzucone/zrealizowane) i opcjonalnie łączyć ją z wpisem na roadmapie (18.3) po zaakceptowaniu — status zmiany powinien opcjonalnie powiadamiać (e-mail) użytkowników, którzy głosowali
- Zabezpieczenie przed nadużyciami: limit liczby zgłoszeń/głosów w jednostce czasu per użytkownik (ochrona przed spamem)

### 18.5 Waitlista

- Formularz zapisu (e-mail, opcjonalnie dodatkowe pola kwalifikujące) dla produktów jeszcze niedostępnych publicznie
- Mechanizm zaproszeń z listy oczekujących (ręczny lub automatyczny wg kolejności zapisu) generujący jednorazowy link dostępu/rejestracji

### 18.6 Formularz kontaktowy

- Standardowy formularz (imię, e-mail, wiadomość) z walidacją i ochroną antyspamową (np. honeypot lub captcha), wysyłający zgłoszenie e-mailem do zespołu i/lub zapisujący je w bazie do obsługi w panelu admina

---

## 19. Deployment

### 19.1 Wymagania

- Aplikacja musi dać się wdrożyć na Vercel (target podstawowy) bez modyfikacji kodu
- Aplikacja musi też dać się uruchomić jako standalone Node.js serwer (np. w kontenerze Docker) — brak zależności od funkcji specyficznych wyłącznie dla środowiska serverless Vercel (np. filesystem tymczasowy, edge-only API) w krytycznych ścieżkach
- Zmienne środowiskowe skonfigurowane i zwalidowane przy starcie aplikacji (fail-fast z czytelnym błędem, jeśli brakuje wymaganej zmiennej, zamiast niejasnego błędu w trakcie działania)

---

## 20. Priorytetyzacja wdrożenia (rekomendacja)

Sugerowana kolejność implementacji dla zespołu (od fundamentu do dodatków):

1. Baza danych + model multi-tenancy + izolacja danych (sekcje 1, 3, 11)
2. Autentykacja (sekcja 2)
3. RBAC (sekcja 4)
4. UI system + dashboard shell (sekcja 7)
5. Billing (sekcja 5)
6. Panel admina (sekcja 6)
7. E-maile + background jobs (sekcje 10, 12)
8. SEO + blog/CMS (sekcje 8, 9)
9. i18n, monitoring, testy (sekcje 14, 15, 16)
10. AI SDK + pluginy dodatkowe (sekcje 13, 18)
11. Rozszerzenia dodane po pierwszej wersji fundamentu (sekcje 21-27) — realizować pojedynczo, nie jako jedna faza, każde z osobną weryfikacją względem testów E2E fundamentu (fazy 2-3). Kolejność wg rosnącego ryzyka konfliktu z istniejącym kodem: (a) Storage, Notification center, AI Agent MCP, środowisko developerskie offline, Backup i przywracanie danych — nowe, izolowane moduły; (b) Passkeys, limity budżetowe — rozszerzenia istniejących adapterów za kontraktem; (c) Security headers/CSP, rate limiting całego API, walidacja jako warstwa — dotykają współdzielonej infrastruktury (middleware), rób pojedynczo; (d) Pełny audit trail, onboarding flow, konfigurowalne wyłączenie multi-tenancy — dotykają fundamentu z faz 1-3, wymagają osobnego namysłu architektonicznego przed implementacją

---

## 21. Storage / przechowywanie plików

**Referencja przy implementacji:** ta sekcja jest fundamentem dla dokumentów/umów (RODO), avatarów, logo organizacji, obrazów bloga (sekcja 8) i wszelkich przyszłych załączników — inne sekcje powinny odwoływać się do tej warstwy, nie implementować własnego uploadu.

### 21.1 Warstwa abstrakcji nad dostawcą

- Wspólny interfejs S3-compatible (działa z AWS S3, Cloudflare R2, Backblaze B2, MinIO lokalnie — sekcja 25) — ten sam wzorzec adaptera co billing (5.1) i e-mail (10.1)
- Operacje: upload, pobranie URL do odczytu (podpisany, czasowo ograniczony dla plików prywatnych), usunięcie, listowanie plików per właściciel

### 21.2 Upload

- Upload przez presigned URL — klient wysyła plik bezpośrednio do storage, nie przez serwer aplikacji (unika przeciążenia serwera dużymi plikami i limitów rozmiaru requestu)
- Backend generuje podpisany URL uploadu tylko po zweryfikowaniu uprawnień (RBAC, sekcja 4.2) i typu/rozmiaru pliku deklarowanego przez klienta
- Walidacja: dozwolone typy MIME per kontekst (np. tylko obrazy dla avatara, PDF/obrazy dla dokumentów), maksymalny rozmiar pliku, skanowanie w tle pod kątem złośliwej zawartości tam, gdzie ryzyko jest istotne (upload publicznie dostępnych plików)

### 21.3 Model danych

- Każdy plik przypisany do `organization_id`/`account_id` (tenant isolation z sekcji 11.2) oraz opcjonalnie do konkretnego rekordu biznesowego (np. dokument przypisany do klienta)
- Metadane: nazwa oryginalna, typ MIME, rozmiar, kto wgrał, kiedy, widoczność (public/private)
- Pliki publiczne (np. logo organizacji na stronie publicznej) dostępne przez stały URL; pliki prywatne wyłącznie przez podpisany, czasowo ograniczony URL generowany na żądanie

### 21.4 Usuwanie i retencja

- Soft delete zgodny z sekcją 11.3 — plik oznaczony jako usunięty nie jest natychmiast kasowany z bucketa, dopiero po okresie retencji (zadanie cykliczne w tle, sekcja 12)

---

## 22. Bezpieczeństwo warstwy aplikacji

Zbiór wymogów niepokrywających się z żadną istniejącą sekcją wprost, ale dotykających wspólnej infrastruktury (middleware/routing) — patrz uwaga w sekcji 20 o kolejności wdrażania tych punktów pojedynczo.

### 22.1 Security headers i Content Security Policy

- Middleware/response headers ustawiane globalnie dla każdej odpowiedzi: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`
- CSP skonfigurowane restrykcyjnie (domyślnie odmowa), z jawną listą dozwolonych źródeł skryptów/stylów/obrazów — każda nowa zewnętrzna integracja (analytics, widget czatu) wymaga świadomego dopisania do listy, nie automatycznego zezwolenia
- **Ważne przy implementacji:** ten mechanizm musi komponować się z istniejącym strażnikiem dostępu (middleware egzekwujący sesję/RBAC/routing i18n), nie może przejmować odpowiedzi ani z nim rywalizować — analogicznie do zasady ustalonej przy integracji next-intl (sekcja 16)

### 22.2 Walidacja danych jako nazwana warstwa architektoniczna

- Zasada: każdy input pochodzący spoza zaufanej granicy (formularz, API request, webhook) przechodzi przez schemat walidacji (np. Zod) **zanim** dotknie logiki biznesowej — walidacja nie jest opcjonalnym dodatkiem, tylko obowiązkowym punktem wejścia
- Schemat walidacji współdzielony między frontendem (walidacja formularza, UX) a backendem (walidacja właściwa, źródło prawdy) — ten sam schemat, nie duplikowana logika
- Błędy walidacji zwracane w spójnym, przewidywalnym formacie (pole → komunikat), konsumowanym jednolicie przez UI

### 22.3 Rate limiting na całym API

- Rozszerzenie mechanizmu z sekcji 2.1 (rate limiting logowania) na wszystkie endpointy API, nie tylko autentykację
- Limity zróżnicowane per typ endpointu (np. bardziej restrykcyjne dla operacji kosztownych obliczeniowo/finansowo, luźniejsze dla odczytu danych)
- Odpowiedź przy przekroczeniu limitu: standardowy kod 429 z nagłówkiem informującym, kiedy można spróbować ponownie

### 22.4 Limity budżetowe dla zewnętrznych API (ochrona operatora)

**Różnica względem quota z sekcji 5.6:** quota chroni przed nadużyciem przez pojedynczego użytkownika w ramach jego planu; limity budżetowe chronią **operatora aplikacji** (Ciebie) przed przypadkowym przepaleniem budżetu niezależnie od limitów per-plan (np. błąd w pętli generującej wywołania AI, obejście quota przez lukę w logice).

- Twardy, globalny limit miesięcznych wydatków na wywołania AI (sekcja 13/26) — po przekroczeniu: nowe wywołania są odrzucane z czytelnym komunikatem, nie cichym printem błędu, z powiadomieniem operatora (e-mail/webhook)
- Analogiczny twardy limit na liczbę/koszt wysyłek e-mail (ochrona przed pętlą wysyłkową lub nadużyciem formularzy)
- Limity konfigurowalne, nie zahardkodowane — łatwe do dostosowania bez zmiany kodu

---

## 23. System powiadomień (Notification center)

**Różnica względem e-maili transakcyjnych (sekcja 10):** to jest osobny, dodatkowy kanał w aplikacji (in-app), nie zamiennik e-maili — użytkownik może dostawać to samo zdarzenie oboma kanałami albo wybrać tylko jeden.

### 23.1 Model danych

- Powiadomienie: odbiorca (user w kontekście organizacji), typ zdarzenia, treść, link docelowy, status (nieprzeczytane/przeczytane), timestamp
- Powiązane z tym samym mechanizmem zdarzeniowym, który wyzwala e-maile transakcyjne (sekcja 10.2) — jedno zdarzenie biznesowe może wygenerować i e-mail, i powiadomienie in-app, zależnie od preferencji użytkownika

### 23.2 UI

- Ikona z licznikiem nieprzeczytanych powiadomień, dostępna globalnie (analogicznie do przełącznika kontekstu z sekcji 3.5)
- Lista powiadomień z możliwością oznaczenia jako przeczytane (pojedynczo/zbiorczo), kliknięcie przenosi do powiązanego zasobu

### 23.3 Preferencje powiadomień

- Użytkownik w ustawieniach konta wybiera per typ zdarzenia, którym kanałem chce być powiadamiany (in-app / e-mail / oba / żaden, tam gdzie zdarzenie nie jest krytyczne — zdarzenia bezpieczeństwa typu „nowe logowanie" nie powinny być możliwe do całkowitego wyłączenia)

### 23.4 Dostarczanie w czasie rzeczywistym

- Nowe powiadomienia pojawiają się w UI bez odświeżania strony (WebSocket albo polling jako prostszy fallback na start)
- **Uwaga architektoniczna:** WebSocket wymaga długo działającego połączenia, co nie zawsze jest trywialne w czysto serverless środowisku (Vercel) — jeśli wybrany hosting tego nie wspiera dobrze, polling w rozsądnym interwale jest akceptowalnym uproszczeniem na start, zgodnie z zasadą „nie buduj ponad bieżącą potrzebę"

---

## 24. Onboarding — wieloetapowy flow po pierwszej rejestracji

**Ważne rozróżnienie:** to jest warstwa UX nad istniejącymi krokami z sekcji 2 (rejestracja) i 3.2 (tworzenie organizacji), **nie** ich zastąpienie. Kroki onboardingu wywołują te same, niezmienione akcje co dotychczas — wizard porządkuje kolejność i prowadzi użytkownika, nie duplikuje logiki rejestracji/tworzenia organizacji.

### 24.1 Struktura

- Sekwencja kroków po pierwszym zalogowaniu (nowo zarejestrowany użytkownik): powitanie → uzupełnienie profilu (imię, opcjonalnie zdjęcie — wykorzystuje storage z sekcji 21) → (jeśli ścieżka „właściciel" z sekcji 3.2) utworzenie organizacji → wybór planu (może być Free, sekcja 5.2) → zakończenie
- Kroki konfigurowalne (możliwość pominięcia niektórych, kolejność dostosowana per produkt budowany na boilerplacie)
- Postęp zapisywany, żeby przerwanie onboardingu (np. zamknięcie karty) pozwalało wrócić do właściwego kroku przy następnym logowaniu, nie zaczynać od nowa

### 24.2 Zakres

- Onboarding dotyczy wyłącznie ścieżki „właściciel"/pierwsza rejestracja — użytkownik dołączający przez zaproszenie (sekcja 3.3) ma osobny, krótszy flow (od razu trafia do organizacji, do której został zaproszony, bez kroku tworzenia organizacji)

---

## 25. Środowisko developerskie offline

**Cel:** umożliwić pracę nad aplikacją (w tym z Claude Code) bez kont w zewnętrznych usługach i bez połączenia z produkcyjną infrastrukturą — czysto lokalny setup, odtwarzalny od zera.

### 25.1 Docker Compose

- Lokalny Postgres (ten sam silnik co produkcja, żeby uniknąć niespójności zachowania)
- Lokalny emulator S3-compatible storage (np. MinIO) — warstwa z sekcji 21.1 wskazuje na niego zamiast na prawdziwy S3/R2 w środowisku lokalnym, bez zmiany kodu aplikacji (to jest bezpośrednia korzyść z trzymania storage za adapterem)
- Lokalny "przechwytywacz" wysyłanych e-maili (np. Mailpit/Mailcatcher) — e-maile transakcyjne (sekcja 10) trafiają do lokalnego podglądu w przeglądarce zamiast do prawdziwych skrzynek, bez potrzeby konta u dostawcy e-mail podczas developmentu

### 25.2 Zgodność z resztą specyfikacji

- To środowisko nie zmienia żadnego kontraktu adaptera z sekcji 1.2 — działa dokładnie dlatego, że billing, e-mail i storage są już schowane za wspólnymi interfejsami; zmiana dostawcy między local/produkcją to wyłącznie zmiana zmiennej środowiskowej wskazującej, którego adaptera użyć

---

## 26. AI Agent (MCP)

**Różnica względem sekcji 13 (AI SDK):** sekcja 13 dotyczy funkcji AI używanych _przez_ użytkownika końcowego w produkcie (chat, generowanie treści). Ta sekcja dotyczy wystawienia **danych własnej aplikacji** asystentom AI (np. Claude, przez Model Context Protocol) do zapytań/modyfikacji w naturalnym języku.

### 26.1 Zakres i ryzyko

- Serwer MCP wystawiający wybrane operacje aplikacji (odczyt danych, wybrane akcje zapisu) jako narzędzia dostępne dla podłączonego asystenta AI
- **Krytyczny wymóg bezpieczeństwa:** każde wywołanie przez agenta AI przechodzi przez **dokładnie ten sam** mechanizm RBAC co zwykły użytkownik (sekcja 4.2) — agent działa w imieniu konkretnego użytkownika/organizacji i nie ma żadnych uprawnień ponad to, co miałby ten użytkownik w standardowym UI
- Każda akcja wykonana przez agenta AI jest rejestrowana w audit trail (sekcja 6.4) z typem wykonawcy `AIAgent`, identycznie jak akcje użytkownika i systemu

### 26.2 Przykładowe zastosowanie

- Zapytania odczytowe w naturalnym języku (np. „ile mam aktywnych uczniów w grupach popołudniowych") tłumaczone na operacje na danych organizacji, z automatycznym filtrowaniem po tenant isolation (sekcja 11.2) — agent fizycznie nie ma dostępu do danych spoza kontekstu, w którym działa

### 26.3 Status w tym boilerplate

- Ten moduł jest bardziej zaawansowanym rozszerzeniem niż fundament — wdrażać dopiero po ustabilizowaniu reszty aplikacji i tylko jeśli konkretny produkt budowany na boilerplacie tego wymaga (zgodnie z kolejnością ryzyka w sekcji 20, punkt 11a)

---

## 27. Backup i przywracanie danych per organizacja

**Kontekst:** sensowne przede wszystkim wtedy, gdy operator boilerplate'u faktycznie hostuje dane wielu organizacji (nie gdy boilerplate jest przekazywany deweloperom do samodzielnego wdrożenia, gdzie odpowiedzialność za backup leży po ich stronie/stronie ich hostingu). Wdrażać przy realnej potrzebie, nie na start pierwszego wertykału.

### 27.1 Zakres kopii zapasowej

- Kopia zapasowa obejmuje dane jednej organizacji (nie całej bazy na raz) — zgodnie z modelem tenant isolation z sekcji 11.2, backup i restore operują w tych samych granicach co reszta systemu
- Konfigurowalny zakres: które moduły/tabele wchodzą w skład kopii (np. dane biznesowe tak, logi audytu sekcji 6.4 opcjonalnie osobno, ze względu na potencjalnie inny wymagany okres retencji)
- Pliki ze storage (sekcja 21) należące do organizacji objęte kopią jako referencje albo pełna kopia — do ustalenia per produkt, zależnie od kosztu duplikowania dużych plików

### 27.2 Szyfrowanie i przechowywanie

- Kopie zapasowe szyfrowane w spoczynku (encryption at rest), osobnym kluczem niż bieżąca baza produkcyjna — kompromitacja jednego nie powinna automatycznie kompromitować drugiego
- Przechowywane w warstwie storage z sekcji 21 (ten sam adapter S3-compatible), w osobnej, niepublicznej przestrzeni niedostępnej przez standardowe ścieżki uploadu/pobierania plików użytkownika

### 27.3 Harmonogram i retencja

- Automatyczny harmonogram kopii (np. codziennie/tygodniowo, konfigurowalne per plan — częstsze kopie jako funkcja planów wyższego poziomu, zgodnie z modelem planów z sekcji 5.2)
- Polityka retencji: liczba/wiek przechowywanych kopii, z automatycznym usuwaniem najstarszych po przekroczeniu limitu (zadanie cykliczne w tle, sekcja 12)
- Możliwość ręcznego wykonania kopii na żądanie przez Ownera organizacji (np. przed dużą, ryzykowną zmianą danych), niezależnie od harmonogramu automatycznego

### 27.4 Przywracanie (restore)

- Przywracanie inicjowane przez Ownera organizacji (z odpowiednim uprawnieniem RBAC, sekcja 4.2) albo przez super admina w imieniu organizacji (z audytem, sekcja 6.4)
- Dwa scenariusze docelowe: przywrócenie do **tej samej** organizacji (np. cofnięcie błędnej masowej operacji) i przywrócenie do **innej/nowej** organizacji (np. duplikacja danych do środowiska testowego)
- **Obsługa konfliktów** przy przywracaniu do organizacji, która od czasu wykonania kopii zmieniła dane: strategia do wyboru przez inicjującego — pomiń rekordy konfliktowe (zachowaj bieżący stan), nadpisz bieżący stan danymi z kopii, albo przerwij całą operację i wymagaj ręcznej decyzji
- Przywracanie jest operacją nieodwracalną bez dodatkowej kopii — przed wykonaniem restore system automatycznie tworzy kopię bieżącego stanu (backup przed restore), żeby błędna decyzja o przywróceniu też dała się cofnąć

### 27.5 Widoczność i kontrola

- Lista dostępnych kopii zapasowych z metadanymi (data utworzenia, rozmiar, zakres, czy automatyczna czy ręczna) widoczna dla Ownera organizacji w ustawieniach
- Status trwającej operacji backup/restore (w toku/zakończona/nieudana) widoczny w UI, nie tylko w logach — obie operacje mogą trwać dłużej niż typowy request i powinny być realizowane jako zadanie w tle (sekcja 12), z powiadomieniem po zakończeniu (sekcja 23)

---
