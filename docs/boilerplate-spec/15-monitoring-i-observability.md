## 15. Monitoring i observability

### 15.1 Error tracking

- Integracja z narzędziem typu Sentry: automatyczne przechwytywanie nieobsłużonych wyjątków po stronie klienta i serwera, z kontekstem (użytkownik, organizacja, akcja) o ile nie narusza to prywatności danych wrażliwych

### 15.2 Analytics produktowy

- Integracja z narzędziem typu PostHog: śledzenie kluczowych zdarzeń biznesowych (rejestracja, aktywacja, upgrade planu, kluczowe akcje produktowe) do analizy lejka konwersji

### 15.3 Logi/traceability

- Ustrukturyzowane logowanie zdarzeń serwerowych (nie `console.log`), z możliwością korelacji requestu (request ID) w całym cyklu życia żądania

---
