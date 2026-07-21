## 27. Backup i przywracanie danych per organizacja

**Kontekst:** sensowne przede wszystkim wtedy, gdy operator boilerplate'u faktycznie hostuje dane wielu organizacji (nie gdy boilerplate jest przekazywany deweloperom do samodzielnego wdrożenia, gdzie odpowiedzialność za backup leży po ich stronie/stronie ich hostingu). Wdrażać przy realnej potrzebie, nie na start pierwszego wertykału.

### 27.1 Zakres kopii zapasowej

- Kopia zapasowa obejmuje dane jednej organizacji (nie całej bazy na raz) — zgodnie z modelem tenant isolation z sekcji 11.2, backup i restore operują w tych samych granicach co reszta systemu
- Konfigurowalny zakres: które moduły/tabele wchodzą w skład kopii (np. dane biznesowe tak, logi audytu sekcji 6.4 opcjonalnie osobno, ze względu na potencjalnie inny wymagany okres retencji)
- Pliki ze storage (sekcja 21) należące do organizacji objęte kopią jako referencje albo pełna kopia — do ustalenia per produkt, zależnie od kosztu duplikowania dużych plików

### 27.2 Szyfrowanie i przechowywanie

- Kopie zapasowe szyfrowane w spoczynku (encryption at rest), osobnym kluczem niż bieżąca baza produkcyjna — kompromitacja jednego nie powinna automatycznie kompromitować drugiego
- Przechowywane w warstwie storage z sekcji 21 (ten sam adapter S3-compatible), w osobnej, niepublicznej przestrzeni niedostępnej przez standardowe ścieżki uploadu/pobierania plików użytkownika

### 27.3 Harmonogram i retencja

- Automatyczny harmonogram kopii (np. codziennie/tygodniowo, konfigurowalne per plan — częstsze kopie jako funkcja planów wyższego poziomu, zgodnie z modelem planów z sekcji 5.2)
- Polityka retencji: liczba/wiek przechowywanych kopii, z automatycznym usuwaniem najstarszych po przekroczeniu limitu (zadanie cykliczne w tle, sekcja 12)
- Możliwość ręcznego wykonania kopii na żądanie przez Ownera organizacji (np. przed dużą, ryzykowną zmianą danych), niezależnie od harmonogramu automatycznego

### 27.4 Przywracanie (restore)

- Przywracanie inicjowane przez Ownera organizacji (z odpowiednim uprawnieniem RBAC, sekcja 4.2) albo przez super admina w imieniu organizacji (z audytem, sekcja 6.4)
- Dwa scenariusze docelowe: przywrócenie do **tej samej** organizacji (np. cofnięcie błędnej masowej operacji) i przywrócenie do **innej/nowej** organizacji (np. duplikacja danych do środowiska testowego)
- **Obsługa konfliktów** przy przywracaniu do organizacji, która od czasu wykonania kopii zmieniła dane: strategia do wyboru przez inicjującego — pomiń rekordy konfliktowe (zachowaj bieżący stan), nadpisz bieżący stan danymi z kopii, albo przerwij całą operację i wymagaj ręcznej decyzji
- Przywracanie jest operacją nieodwracalną bez dodatkowej kopii — przed wykonaniem restore system automatycznie tworzy kopię bieżącego stanu (backup przed restore), żeby błędna decyzja o przywróceniu też dała się cofnąć

### 27.5 Widoczność i kontrola

- Lista dostępnych kopii zapasowych z metadanymi (data utworzenia, rozmiar, zakres, czy automatyczna czy ręczna) widoczna dla Ownera organizacji w ustawieniach
- Status trwającej operacji backup/restore (w toku/zakończona/nieudana) widoczny w UI, nie tylko w logach — obie operacje mogą trwać dłużej niż typowy request i powinny być realizowane jako zadanie w tle (sekcja 12), z powiadomieniem po zakończeniu (sekcja 23)

---
