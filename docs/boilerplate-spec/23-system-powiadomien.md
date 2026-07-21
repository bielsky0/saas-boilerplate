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
