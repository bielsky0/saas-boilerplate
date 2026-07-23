<!-- @docs/specyfikacja.md -->
@AGENTS.md

NAZWY ZMIENNYCH FUNKCJI ITP TYLKO PO ANGIELSKU

Pełna treść specyfikacji żyje teraz w `docs/spec/` (docs/specyfikacja.md to tylko spis treści), plan implementacji w `docs/plan/` (docs/plan-implementacji.md to tylko spis treści), konwencje kodu w `docs/architecture/` (docs/ARCHITECTURE.md to tylko spis treści), a specyfikacja fundamentu boilerplate'owego w `docs/boilerplate-spec/` (docs/boilerplate-spec.md to tylko spis treści) — patrz sekcja „Duże dokumenty — zasady dostępu" poniżej.

Don't remove agents.md file

DON'T COMMIT

# Zasady pracy nad langlion

`docs/plan-implementacji.md` jest **jedynym trwałym źródłem prawdy o planie i postępie** implementacji langlion. Specyfikacja fundamentu boilerplate'owego (cel odwołań „boilerplate §X"): `docs/boilerplate-spec/` (numeracja rozdziałów = numeracja plików, `docs/boilerplate-spec.md` to spis treści). Konwencje kodu: `docs/ARCHITECTURE.md`.

1. **Pracujemy fazami** zgodnie z `docs/plan-implementacji.md`. Na początku każdej sesji pracy nad fazą najpierw odczytaj ten plik, żeby odzyskać kontekst — nie zakładaj, że pamiętasz poprzednie ustalenia.
2. **Po zamknięciu fazy:** zaktualizuj `docs/plan-implementacji.md` (status fazy → „zakończona", ewentualne korekty planu dalszych faz), zreferuj wykonaną pracę względem definicji ukończenia (DoD) tej fazy i **CZEKAJ na zatwierdzenie** użytkownika przed szczegółowym rozpisaniem i rozpoczęciem kolejnej fazy. Aktualizacja pliku planu jest obowiązkowym krokiem kończącym każdą fazę, nie opcjonalnym.
3. **Nigdy nie łącz dwóch faz** w jedną sesję pracy bez wyraźnej zgody użytkownika.
4. **Błąd w planie** (np. zła kolejność zależności odkryta w trakcie pracy): zatrzymaj się, zaktualizuj `docs/plan-implementacji.md` z uzasadnieniem zmiany i zaproponuj korektę — nie improwizuj po cichu.
5. **Otwarte pytania** wypisane w sekcji „Ryzyka i otwarte pytania" planu zadawaj użytkownikowi na starcie fazy, której dotyczą — nie zgaduj.

# Duże dokumenty — zasady dostępu

Dotyczy dużych, podzielonych dokumentów w `docs/`: `docs/spec/`, `docs/plan/`, `docs/architecture/`, `docs/boilerplate-spec/` (oraz ich spisów treści: `docs/specyfikacja.md`, `docs/plan-implementacji.md`, `docs/ARCHITECTURE.md`, `docs/boilerplate-spec.md`).

1. Przed czytaniem czegokolwiek z tych katalogów zawsze najpierw zapytaj graf graphify o szukaną sekcję/temat.
2. Pełny odczyt pliku z tych katalogów rób tylko z `offset`/`limit` ograniczonym do potrzebnej sekcji — nigdy całego pliku naraz.
3. Jeśli temat sesji regularnie wymaga tej samej sekcji, zaproponuj użytkownikowi dalszy podział tego konkretnego pliku zamiast kontynuować duże odczyty.
4. Małe, niepodzielone pliki (np. `docs/specyfikacja-cms.md`) można czytać w całości bez ograniczeń — nie są objęte powyższymi zasadami.
