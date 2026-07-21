### EPIK 39 — Import masowy przy onboardingu (v17)

**US-39.1** Jako administrator, chcę zaimportować bazę rodziców i dzieci z pliku CSV.
- AC1: Given mam `data.import` i plik client+athlete, When uruchamiam import, Then dla każdego poprawnego wiersza powstaje `client` (lub dopisanie do istniejącego) oraz `athlete`.
- AC2: Given plik zawiera e-mail rodzica już istniejącego w tej akademii, When import go przetwarza, Then dziecko jest dopisywane do istniejącego profilu (dedup po `(organization_id, email)`), nie powstaje duplikat `client`.

**US-39.2** Jako administrator, chcę, aby jeden błędny wiersz nie przerywał całej migracji.
- AC1: Given plik ma wiersze poprawne i błędne, When uruchamiam import, Then poprawne wiersze są zapisane, a błędne trafiają na raport błędów per wiersz (walidacja wierszowa, nie atomowa — Rozstrzygnięcie #29).
- AC2: Given import się zakończył, When przeglądam wynik, Then widzę zbiorczy raport (zaimportowane / pominięte z powodem) — ten sam wzorzec co Mass Move Bookings (§2.11).

**US-39.3** Jako system, chcę, aby zaimportowany klient przeszedł weryfikację przed rozpoznaniem.
- AC1: Given zaimportowałem klienta, When rekord `client` powstaje, Then ma `is_verified=false`.
- AC2: Given zaimportowany klient loguje się po raz pierwszy, When podaje e-mail, Then przechodzi pełną weryfikację OTP i nie jest rozpoznawany skróconą ścieżką, dopóki jej nie ukończy (§2.8, Rozstrzygnięcie #29).
- AC3: Given import przetwarza wiersze z danymi profilu, When zapisuje `athlete`, Then **nie** tworzy rekordów `athlete_consent`/`policy_acceptance` — zgody nie są fabrykowane (§1.3, Zasada).

**US-39.4** Jako administrator systemu, chcę, aby import był ograniczony do uprawnionego kręgu.
- AC1: Given użytkownik bez `data.import` wysyła żądanie importu bezpośrednio przez API, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI (§4.2).
