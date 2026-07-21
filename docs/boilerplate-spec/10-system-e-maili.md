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
