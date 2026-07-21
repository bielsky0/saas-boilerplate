## 25. Środowisko developerskie offline

**Cel:** umożliwić pracę nad aplikacją (w tym z Claude Code) bez kont w zewnętrznych usługach i bez połączenia z produkcyjną infrastrukturą — czysto lokalny setup, odtwarzalny od zera.

### 25.1 Docker Compose

- Lokalny Postgres (ten sam silnik co produkcja, żeby uniknąć niespójności zachowania)
- Lokalny emulator S3-compatible storage (np. MinIO) — warstwa z sekcji 21.1 wskazuje na niego zamiast na prawdziwy S3/R2 w środowisku lokalnym, bez zmiany kodu aplikacji (to jest bezpośrednia korzyść z trzymania storage za adapterem)
- Lokalny "przechwytywacz" wysyłanych e-maili (np. Mailpit/Mailcatcher) — e-maile transakcyjne (sekcja 10) trafiają do lokalnego podglądu w przeglądarce zamiast do prawdziwych skrzynek, bez potrzeby konta u dostawcy e-mail podczas developmentu

### 25.2 Zgodność z resztą specyfikacji

- To środowisko nie zmienia żadnego kontraktu adaptera z sekcji 1.2 — działa dokładnie dlatego, że billing, e-mail i storage są już schowane za wspólnymi interfejsami; zmiana dostawcy między local/produkcją to wyłącznie zmiana zmiennej środowiskowej wskazującej, którego adaptera użyć

---
