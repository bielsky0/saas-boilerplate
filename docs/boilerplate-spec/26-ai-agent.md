## 26. AI Agent (MCP)

**Różnica względem sekcji 13 (AI SDK):** sekcja 13 dotyczy funkcji AI używanych _przez_ użytkownika końcowego w produkcie (chat, generowanie treści). Ta sekcja dotyczy wystawienia **danych własnej aplikacji** asystentom AI (np. Claude, przez Model Context Protocol) do zapytań/modyfikacji w naturalnym języku.

### 26.1 Zakres i ryzyko

- Serwer MCP wystawiający wybrane operacje aplikacji (odczyt danych, wybrane akcje zapisu) jako narzędzia dostępne dla podłączonego asystenta AI
- **Krytyczny wymóg bezpieczeństwa:** każde wywołanie przez agenta AI przechodzi przez **dokładnie ten sam** mechanizm RBAC co zwykły użytkownik (sekcja 4.2) — agent działa w imieniu konkretnego użytkownika/organizacji i nie ma żadnych uprawnień ponad to, co miałby ten użytkownik w standardowym UI
- Każda akcja wykonana przez agenta AI jest rejestrowana w audit trail (sekcja 6.4) z typem wykonawcy `AIAgent`, identycznie jak akcje użytkownika i systemu

### 26.2 Przykładowe zastosowanie

- Zapytania odczytowe w naturalnym języku (np. „ile mam aktywnych uczniów w grupach popołudniowych") tłumaczone na operacje na danych organizacji, z automatycznym filtrowaniem po tenant isolation (sekcja 11.2) — agent fizycznie nie ma dostępu do danych spoza kontekstu, w którym działa

### 26.3 Status w tym boilerplate

- Ten moduł jest bardziej zaawansowanym rozszerzeniem niż fundament — wdrażać dopiero po ustabilizowaniu reszty aplikacji i tylko jeśli konkretny produkt budowany na boilerplacie tego wymaga (zgodnie z kolejnością ryzyka w sekcji 20, punkt 11a)

---
