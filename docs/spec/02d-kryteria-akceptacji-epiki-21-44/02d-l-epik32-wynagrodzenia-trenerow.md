### EPIK 32 — Wynagrodzenia trenerów, wyłącznie informacyjne (v15)

**US-32.1** Jako administrator, chcę zdefiniować stawkę trenera, aby móc raportować należne wynagrodzenie.
- AC1: Given mam uprawnienie `trainer_rates.manage`, When tworzę `trainer_rate` dla trenera bez wskazania `group_type_id`, Then powstaje jego stawka bazowa obowiązująca we wszystkich typach grup.
- AC2: Given trener ma stawkę bazową, When tworzę dodatkowy `trainer_rate` dla konkretnego `group_type_id`, Then dla sesji tego typu obowiązuje stawka nadpisująca, a dla pozostałych — bazowa (Constraint 8).
- AC3: Given jestem trenerem, When próbuję utworzyć lub zmienić jakąkolwiek stawkę, Then operacja jest odrzucana — `trainer_rates.manage` mają wyłącznie Owner i Admin.
- AC4: Given `amount` jest zapisywane, When sprawdzam jego interpretację, Then jest to ryczałt za poprowadzoną sesję w najmniejszej jednostce waluty (§2.14), niezależny od liczby uczestników i długości zajęć.

**US-32.2** Jako administrator, chcę podnieść stawkę trenera bez zmiany rozliczenia minionych miesięcy.
- AC1: Given trener ma stawkę 100 zł z `effective_from = 2026-01-01`, When ustalam nową stawkę 120 zł od `2026-09-01`, Then powstaje nowy rekord `trainer_rate`, a poprzedni pozostaje nietknięty.
- AC2: Given powyższe, When generuję raport za sierpień 2026, Then sesje są liczone po 100 zł; raport za wrzesień liczy je po 120 zł.
- AC3: Given raport za miniony okres został już wygenerowany i podniesiono stawkę, When generuję go ponownie, Then wynik jest identyczny jak poprzednio — zmiana stawki nie działa wstecz.

**US-32.3** Jako administrator, chcę zobaczyć zestawienie należnych wynagrodzeń za wybrany okres.
- AC1: Given wybieram trenera i zakres dat, When generuję raport, Then suma obejmuje wyłącznie sesje, w których ten trener był prowadzącym ORAZ co najmniej jedna powiązana `booking` ma `attendance_status != 'unmarked'`.
- AC2: Given sesja odbyła się w okresie, ale nikt nie oznaczył na niej obecności, When raport jest generowany, Then ta sesja NIE jest liczona.
- AC3: Given na sesji wszyscy uczestnicy zostali oznaczeni jako `absent`, When raport jest generowany, Then sesja JEST liczona — prowadzący pojawił się i sprawdził listę, więc stawka mu przysługuje.
- AC4: Given sesja kwalifikuje się wg AC1, ale Constraint 8 nie rozstrzyga dla niej żadnej stawki, When raport jest generowany, Then sesja trafia na **wyodrębnioną listę „brak stawki"** widoczną dla admina i NIE jest liczona jako zero ani pomijana bez śladu.

**US-32.4** Jako trener, chcę widzieć własne zestawienie, ale nie cudze.
- AC1: Given mam uprawnienie `trainer_earnings.view` jako trener, When otwieram raport, Then widzę wyłącznie własne sesje i własne kwoty.
- AC2: Given próbuję pobrać dane innego trenera bezpośrednio przez API, When żądanie dociera do backendu, Then jest odrzucane niezależnie od UI.
- AC3: Given jestem Ownerem lub Adminem, When otwieram raport, Then widzę dane wszystkich trenerów organizacji.

**US-32.5** Jako właściciel platformy, chcę mieć pewność, że moduł wynagrodzeń nie wywołuje żadnych skutków finansowych.
- AC1: Given raport został wygenerowany dla dowolnego okresu i kwoty, When sprawdzam skutki, Then nie powstaje żadna płatność, wypłata ani transfer.
- AC2: Given powyższe, When sprawdzam oba konta Stripe (Platform Billing oraz Connected Account akademii, Zasada nadrzędna #7), Then żadne z nich nie odnotowuje jakiejkolwiek operacji wywołanej tym raportem.
- AC3: Given trener ma wyliczone wynagrodzenie, When szukam ścieżki jego wypłaty w systemie, Then taka ścieżka nie istnieje — rozliczenie odbywa się poza systemem.

**US-32.6 (v17)** Jako administrator, chcę rozliczać wybranych trenerów stawką godzinową przeliczaną przez czas trwania zajęć, a innych ryczałtem za sesję.
- AC1: Given tworzę `trainer_rate` z `rate_type=hourly` i `amount` = stawka za godzinę, When generuję raport dla sesji trwającej 90 minut, Then wynagrodzenie za tę sesję = `amount × 1,5`.
- AC2: Given `trainer_rate` z `rate_type=flat_per_session`, When generuję raport, Then kwota za sesję jest równa `amount` niezależnie od długości zajęć — zachowanie sprzed v17 (Rozstrzygnięcie #18).
- AC3: Given ten sam trener ma stawkę `hourly` dla jednego `group_type` i `flat_per_session` (bazową, `group_type_id=NULL`) dla pozostałych, When raport rozstrzyga stawkę sesji, Then stosuje `rate_type` **tego wiersza `trainer_rate`, który wygrywa wg Constraint 8** — `rate_type` jest per `trainer_rate` (Rozstrzygnięcie #28).
- AC4: Given podnoszę stawkę godzinową od nowego sezonu (nowy rekord z własnym `effective_from`), When generuję raport za miniony okres, Then przeliczenie używa stawki obowiązującej w dniu sesji — nieretroaktywność (Constraint 8) obowiązuje tak samo dla `hourly`, jak dla `flat_per_session`.
