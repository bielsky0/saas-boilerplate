## 13. Integracja AI SDK

### 13.1 Zakres

- Wspólna warstwa do wywoływania modeli AI (np. do generowania treści, streszczeń, sugestii) używana przez funkcje produktowe — nie jest to sam boilerplate „AI-native", ale przygotowana instalacja i konfiguracja SDK, gotowa do podpięcia konkretnego przypadku użycia
- Obsługa streamingu odpowiedzi do UI (tokeny pojawiające się progresywnie), obsługa błędów/limitów dostawcy modelu (rate limit, timeout) z czytelnym komunikatem dla użytkownika

### 13.2 Koszty i limity

- Wywołania AI powinny być powiązane z systemem quota (sekcja 5.6), jeśli funkcje AI mają być ograniczane per plan

---
