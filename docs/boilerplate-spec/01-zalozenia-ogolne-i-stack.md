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
