## 24. Onboarding — wieloetapowy flow po pierwszej rejestracji

**Ważne rozróżnienie:** to jest warstwa UX nad istniejącymi krokami z sekcji 2 (rejestracja) i 3.2 (tworzenie organizacji), **nie** ich zastąpienie. Kroki onboardingu wywołują te same, niezmienione akcje co dotychczas — wizard porządkuje kolejność i prowadzi użytkownika, nie duplikuje logiki rejestracji/tworzenia organizacji.

### 24.1 Struktura

- Sekwencja kroków po pierwszym zalogowaniu (nowo zarejestrowany użytkownik): powitanie → uzupełnienie profilu (imię, opcjonalnie zdjęcie — wykorzystuje storage z sekcji 21) → (jeśli ścieżka „właściciel" z sekcji 3.2) utworzenie organizacji → wybór planu (może być Free, sekcja 5.2) → zakończenie
- Kroki konfigurowalne (możliwość pominięcia niektórych, kolejność dostosowana per produkt budowany na boilerplacie)
- Postęp zapisywany, żeby przerwanie onboardingu (np. zamknięcie karty) pozwalało wrócić do właściwego kroku przy następnym logowaniu, nie zaczynać od nowa

### 24.2 Zakres

- Onboarding dotyczy wyłącznie ścieżki „właściciel"/pierwsza rejestracja — użytkownik dołączający przez zaproszenie (sekcja 3.3) ma osobny, krótszy flow (od razu trafia do organizacji, do której został zaproszony, bez kroku tworzenia organizacji)

---
