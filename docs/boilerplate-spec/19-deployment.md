## 19. Deployment

### 19.1 Wymagania

- Aplikacja musi dać się wdrożyć na Vercel (target podstawowy) bez modyfikacji kodu
- Aplikacja musi też dać się uruchomić jako standalone Node.js serwer (np. w kontenerze Docker) — brak zależności od funkcji specyficznych wyłącznie dla środowiska serverless Vercel (np. filesystem tymczasowy, edge-only API) w krytycznych ścieżkach
- Zmienne środowiskowe skonfigurowane i zwalidowane przy starcie aplikacji (fail-fast z czytelnym błędem, jeśli brakuje wymaganej zmiennej, zamiast niejasnego błędu w trakcie działania)

---
