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
