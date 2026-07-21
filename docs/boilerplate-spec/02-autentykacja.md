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
