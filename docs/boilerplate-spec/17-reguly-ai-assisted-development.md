## 17. Reguły AI-assisted development (meta-wymaganie projektowe)

### 17.1 Cel

Kodebaza ma być zorganizowana w sposób ułatwiający pracę z asystentami AI (Cursor, Claude Code i podobne) — to wymaganie dotyczy struktury projektu, nie funkcji end-usera.

### 17.2 Konkretne wymagania

- Spójna, przewidywalna struktura katalogów (np. jasny podział na `features/`, `components/`, `lib/`, z jednym wzorcem nazewnictwa plików) — dokumentacja tego wzorca musi istnieć jako plik w repozytorium (np. plik z regułami dla asystentów AI), opisujący konwencje projektu (jak dodać nowy moduł, jak wygląda wzorzec CRUD w tym projekcie, gdzie żyje logika autoryzacji)
- Każdy powtarzalny wzorzec (np. „jak dodać nowy chroniony endpoint API", „jak dodać nową encję z tenant isolation") powinien mieć swój udokumentowany przykład referencyjny w kodzie, do którego można się odwołać

---
