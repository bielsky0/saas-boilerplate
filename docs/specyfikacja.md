# Specyfikacja techniczna: Next.js SaaS Boilerplate

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

---

*Dokument stanowi bazę do estymacji i implementacji. Każda sekcja powinna zostać doprecyzowana o konkretne makiety UI (Figma) przed startem developmentu danego modułu.*