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
