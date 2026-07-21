## 2. Kryteria akceptacji — EPIK 1–20

Opis funkcjonalności: [część 1](02a-opis-funkcjonalnosci-cz1.md), [część 2](02b-opis-funkcjonalnosci-cz2.md). Dalsze kryteria: [EPIK 21–44](02d-kryteria-akceptacji-epiki-21-44.md).

Konwencja: Jako `<rola>`, chcę `<cel>`, aby `<korzyść>`. AC w formacie Given/When/Then. Numeracja `US-<EPIK>.<nr>` odpowiada sekcjom specyfikacji technicznej.

### EPIK 1 — Multi-tenancy i strefa czasowa

**US-1.1** Jako właściciel platformy, chcę, aby dane każdej akademii były fizycznie odizolowane od innych, aby błąd w jednej organizacji nie ujawnił danych innej.
- AC1: Given dwie organizacje A i B, When użytkownik zalogowany do A wykonuje dowolne zapytanie o session/booking/credit, Then zwracane są wyłącznie rekordy z `organization_id = A`, nawet jeśli warstwa aplikacji pominie filtr (RLS jako ostatnia linia obrony).
- AC2: Given nowy rekord session/booking/credit jest tworzony, When zapis następuje, Then `organization_id` jest ustawiane automatycznie z encji nadrzędnej i nie jest edytowalne przez API.

**US-1.2** Jako administrator akademii, chcę, aby godziny zajęć były zawsze zgodne z lokalnym czasem mojej akademii, niezależnie od zmiany czasu i strefy klienta.
- AC1: Given `group_type_recurrence` z `start_time=17:00` i `organization.timezone=Europe/Warsaw`, When system generuje sesje w okresie zmiany czasu (marzec/październik), Then każda wygenerowana sesja ma lokalną godzinę 17:00 w Warszawie (nie przesuniętą o godzinę).
- AC2: Given klient przegląda ofertę z innej strefy czasowej, When widzi godzinę zajęć, Then wyświetlana jest ona przeliczona na jego lokalną strefę, ale zapis w bazie i faktyczny czas zajęć pozostają w `organization.timezone`.
- AC3: Given kredyt z `valid_until` = koniec miesiąca, When liczona jest data wygaśnięcia, Then liczona jest w `organization.timezone`, nie UTC.

### EPIK 2 — Definicja typu zajęć i wzorca

**US-2.1** Jako administrator, chcę zdefiniować typ zajęć z ceną i silnikiem działania, aby móc otworzyć zapisy.
- AC1: Given tworzę `group_type`, When nie podam `price`, Then system odrzuca zapis (pole wymagane).
- AC2: Given zapisuję `group_type` z `engine=schedule_first`, When definiuję `group_type_recurrence`, Then muszę wskazać `trainer_id` (walidacja wymagana dla tego silnika).
- AC3: Given `engine=slot_first`, When definiuję `group_type`, Then nie jestem zmuszony wskazać trenera — system obliczy dostępność dynamicznie.
- AC4 (v15): Given tworzę/edytuję `group_type`, When wypełniam (lub pomijam) pole `description`, Then jest ono opcjonalne, przyjmuje treść w markdown i jest renderowane na publicznej stronie oferty (`{organization.subdomain}.langlion.pl/zapisy/{slug}`, §2.27); brak opisu nie blokuje zapisu ani nie wpływa na żadną logikę rezerwacji ani cenową.

**US-2.2** Jako administrator, chcę edytować Definicję typu zajęć bez wpływu na już wygenerowane sesje z rezerwacjami.
- AC1: Given `group_type` ma wygenerowane sesje z aktywnymi rezerwacjami, When admin zmienia `price` lub `payment_policy` na Definicji, Then istniejące `booking.price_snapshot` pozostają niezmienione.
- AC2: Given zmiana Definicji, When kolejna sesja jest generowana z tego wzorca, Then nowa sesja/rezerwacja stosuje zaktualizowaną politykę.

**US-2.3** Jako administrator, chcę zdefiniować kilka wzorców (dni/godziny/trenerów) pod tym samym typem zajęć.
- AC1: Given `group_type` „Piłka nożna Junior", When dodaję dwa `group_type_recurrence` (pon 17:00/trener A, śr 18:00/trener B), Then oba są aktywne równolegle pod tym samym typem, a kredyty tego typu działają na obu.

### EPIK 3 — Generowanie grafiku (cykliczność)

**US-3.1** Jako administrator, chcę, aby zapisanie cyklicznego wzorca automatycznie wygenerowało cały sezon zajęć, bez osobnego kroku „Generuj".
- AC1: Given zaznaczam `is_recurring=true` i `occurrences_count=30`, When zapisuję `group_type_recurrence`, Then w tle tworzone jest zadanie generujące 30 rekordów `session`, bez dodatkowej akcji z mojej strony.
- AC2: Given `is_recurring=false`, When zapisuję wzorzec, Then powstaje dokładnie jedna sesja, synchronicznie.

**US-3.2** Jako administrator, chcę bezpiecznie przedłużyć sezon bez tworzenia duplikatów.
- AC1: Given wzorzec ma już 30 wygenerowanych sesji, When zwiększam `occurrences_count` do 40, Then generowane jest wyłącznie 10 nowych, brakujących sesji.
- AC2: Given generowanie zostało przerwane błędem w połowie, When zadanie jest ponawiane, Then istniejące sesje (unikalny constraint na `recurrence_id` + `start_time`) nie są duplikowane.

**US-3.3** Jako administrator, chcę zmniejszyć liczbę powtórzeń bez ryzyka utraty zarezerwowanych zajęć.
- AC1: Given wzorzec ma 30 wygenerowanych, częściowo zarezerwowanych sesji, When zmniejszam `occurrences_count` do 20, Then żadna z istniejących 30 sesji nie jest automatycznie usuwana.

**US-3.4** Jako administrator, chcę zmienić dzień/godzinę/lokalizację wzorca w trakcie trwania sezonu i mieć jeden spójny grafik.
- AC1: Given wzorzec „poniedziałek 17:00" ma przyszłe, nieodbyte sesje z rezerwacjami, When zmieniam godzinę na „poniedziałek 18:00", Then wszystkie przyszłe sesje tego wzorca są zaktualizowane w miejscu (UPDATE) na nową godzinę.
- AC2: Given te same sesje mają już odbyte terminy w historii, When zmiana jest zapisywana, Then odbyte sesje pozostają nietknięte.
- AC3: Given sesja ma aktywne rezerwacje, When jej godzina jest przesuwana, Then powiązane `booking` NIE są anulowane, a ich zdenormalizowane `session_start_time`/`end_time` są aktualizowane w tej samej transakcji.
- AC4: Given zmiana godziny/lokalizacji dotyka klientów z rezerwacjami, When zmiana jest zapisana, Then wysyłane jest powiadomienie do każdego dotkniętego klienta.
- AC5: Given nowa godzina koliduje z innymi zajęciami tego samego trenera, When system wykrywa kolizję, Then stosowana jest ta sama zasada co przy tworzeniu sesji w Schedule-First (ostrzeżenie + możliwość Force Override dla uprawnionej roli).
- AC6: Given aktualizacja sesji odbywa się w tym samym momencie, co próba utworzenia na niej nowego bookingu, When obie operacje trafiają na tę samą sesję, Then transakcja aktualizująca sesję bierze `SELECT ... FOR UPDATE` na jej wierszu — operacje są serializowane, druga czeka i działa na już zaktualizowanych danych.
- AC7: Given przesunięcie konkretnej sesji spowodowałoby kolizję z inną, niezależną aktywną rezerwacją tego samego zawodnika (constraint §5.3), When system wykrywa tę kolizję podczas masowej aktualizacji sezonu, Then wyłącznie ta jedna sesja jest pomijana — reszta sezonu przesuwa się normalnie, bez wycofywania całej operacji. Pominięta sesja trafia na listę do ręcznego rozwiązania przez admina, z podanym powodem kolizji.
- AC8: Given sesja ma `is_manually_adjusted=true` (admin wcześniej ręcznie zmienił jej czas lub lokalizację niezależnie od wzorca), When masowa aktualizacja z poziomu wzorca jest wykonywana, Then ta sesja jest pomijana — jej ręczna korekta nie zostaje nadpisana. System loguje ostrzeżenie i uwzględnia ją na tej samej liście pominiętych sesji co AC7.
- AC9: Given admin ręcznie zmienia `start_time`/`end_time` LUB `location_id` pojedynczej sesji (poza edycją wzorca), When zapis następuje, Then `is_manually_adjusted` jest ustawiane na `true`.
- AC10: Given sesja ma wymuszony konflikt trenera przez Force Override (§3.1), When ta sama sesja jest objęta masową aktualizacją wzorca, Then `is_manually_adjusted` NIE jest automatycznie ustawiane przez Force Override i nie chroni sesji przed nadpisaniem.

### EPIK 4 — Rejestracja i zapis klienta (ścieżka publiczna)

**US-4.1** Jako rodzic, chcę zapisać dziecko na zajęcia bez zakładania konta z góry.
- AC1: Given wchodzę na link rejestracji, When wypełniam formularz (dla kogo, dane uczestnika, dane kontaktowe, metoda płatności), Then system tworzy `client` (jeśli nie istnieje dla `(organization_id, email)`) z `is_verified=false` oraz `athlete`, bez wymagania logowania przed zapisem.

**US-4.2** Jako system, chcę rozpoznać istniejącego, zweryfikowanego klienta i skrócić mu ścieżkę zapisu.
- AC1: Given wpisuję e-mail pasujący do istniejącego `client` TEJ SAMEJ organizacji z `is_verified=true`, When system sprawdza w tle, Then pola formularza są automatycznie wypełnione danymi profilu, a krok OTP jest pomijany. Rekord `client` z innej organizacji nigdy nie jest dopasowywany (rewizja 14.1).
- AC2: Given jestem rozpoznanym klientem, When wybieram sesję z wolnym miejscem, Then rezerwacja jest finalizowana od razu, minimalną liczbą kroków.
- AC3: Given e-mail nie pasuje do żadnego zweryfikowanego `client` w tej organizacji, When kontynuuję zapis, Then przechodzę standardową ścieżkę z pełnym formularzem i weryfikacją OTP.
- AC4 (v15): Given jestem rozpoznany jako zweryfikowany klient (`is_verified=true` — ten sam moment, w którym pomijany jest OTP i uzupełniane są dane w AC1) ORAZ mam aktywny `client_price_override` (`is_active=true`, w oknie `valid_from`/`valid_until`) pasujący do wybranej oferty, When formularz renderuje cenę — zarówno dla pojedynczych zajęć (`group_type.price`), jak i dla listy pakietów (`product_template.price`) — Then wyświetlana jest cena PO zastosowaniu override (Constraint 9), zanim wybiorę metodę płatności i sfinalizuję zapis. Cena po rabacie wyświetlana na formularzu jest tą samą wartością, która trafi do Stripe jako ad-hoc `price_data` przy zakładaniu subskrypcji (nie przez `product_template.stripe_price_id`) — patrz Rozstrzygnięcie #20.
- AC5 (v15): Given jestem rozpoznany, ale nie mam aktywnego override pasującego do tej oferty, When formularz renderuje cenę, Then wyświetlana jest cena katalogowa — bez zmian względem stanu sprzed v15.
- AC6 (v15): Given jestem nowym lub niezweryfikowanym klientem, When wypełniam formularz, Then zawsze widzę cenę katalogową. Rabat nie jest prezentowany przed weryfikacją, nawet jeśli admin już go przyznał: `client_price_override` wskazuje na `client_id`, który istnieje od upsertu przy pierwszej próbie zapisu (§US-4.1), ale **wyświetlanie rabatu jest bramkowane tym samym progiem zaufania co reszta rozpoznania w AC1**, nie samym istnieniem rekordu.

**US-4.3** Jako administrator, chcę ograniczyć widoczność wybranej oferty do nowych klientów.
- AC1: Given `group_type.is_new_client_only=true`, When rozpoznany istniejący klient (§US-4.2) korzysta z tego samego linku, Then NIE zostaje odrzucony komunikatem „tylko dla nowych" — flaga działa jako priorytetowe kierowanie nowych klientów, nie twarda bramka.

**US-4.4** Jako klient, chcę wybrać metodę płatności przy zapisie, o ile typ grupy w ogóle dopuszcza zakup pojedynczych zajęć.
- AC1: Given `group_type.allowed_purchase_modes` zawiera `single_class`, When wypełniam formularz i wybieram „Płacę online", Then `booking.payment_status = payment_pending`.
- AC2: Given wybieram „Płacę na miejscu", When zapis jest finalizowany, Then `payment_status = booked_offline`.
- AC3: Given `group_type.payment_policy` nie dopuszcza wybranej metody, When wypełniam formularz, Then ta opcja płatności nie jest w ogóle prezentowana.
- AC4: Given `group_type.allowed_purchase_modes` NIE zawiera `single_class` (wyłącznie `package`), When przeglądam formularz rejestracji, Then opcja płatności za pojedyncze zajęcia w ogóle nie jest prezentowana.

**US-4.5** Jako klient, chcę potwierdzić rezerwację kodem OTP.
- AC1: Given zapis został utworzony, When system wysyła OTP (domenowy, scoped do `(organization_id, email)` — rewizja 14.1) i klient go poprawnie wpisuje, Then `client.is_verified` zmienia się na `true`.

**US-4.6** Jako klient, chcę mieć pewność, że cena i polityka płatności z momentu mojej rezerwacji nie zmienią się później.
- AC1: Given rezerwuję zajęcia przy cenie 100 zł, When admin później podniesie cenę `group_type.price` do 120 zł, Then moja istniejąca rezerwacja zachowuje `price_snapshot=100 zł`.

### EPIK 5 — Płatność online za pojedyncze zajęcia

**US-5.1** Jako klient, chcę zapłacić online i mieć potwierdzone miejsce automatycznie.
- AC1: Given `booking.payment_status=payment_pending`, When otrzymywany jest webhook Stripe potwierdzający płatność, Then system generuje jednostkę `credit` (`source=online_payment`) i natychmiast konsumuje ją na tę rezerwację w tej samej transakcji, zanim status zmieni się na `confirmed`.
- AC2: Given płatność została potwierdzona wyłącznie przez przekierowanie (redirect), ale webhook jeszcze nie dotarł, When sprawdzany jest status rezerwacji, Then rezerwacja NIE jest jeszcze `confirmed`.
- AC3: Given kredyt `online_payment` powstał i został skonsumowany atomowo, When klient sprawdza swój portfel kredytów, Then ten kredyt nigdy się w nim nie pojawia.

### EPIK 6 — Płatność na miejscu (pojedyncze zajęcia)

**US-6.1** Jako recepcja, chcę zatwierdzić otrzymaną gotówkę i potwierdzić miejsce klienta.
- AC1: Given `booking.payment_status=booked_offline`, When recepcja klika „Zatwierdź" po otrzymaniu gotówki, Then generowany jest `credit` (`source=on_site_payment`), natychmiast konsumowany na tę rezerwację, status zmienia się na `confirmed`.
- AC2: Given zatwierdzenie nastąpiło, When sprawdzany jest audit trail, Then zapisane jest kto, kiedy, która rezerwacja.

**US-6.2** Jako system, nie chcę automatycznie zwalniać miejsca klientowi, który nie zapłacił przed zajęciami.
- AC1: Given rezerwacja pozostaje `booked_offline` do godziny zajęć, When zajęcia się rozpoczynają, Then system NIE zmienia statusu ani nie zwalnia miejsca automatycznie.

**US-6.3** Jako trener, chcę widzieć na liście uczestników, kto zapłacił, a kto nie.
- AC1: Given lista uczestników sesji, When trener ją otwiera, Then rezerwacje `confirmed` są oznaczone na zielono, a `booked_offline` na żółto/pomarańczowo.

### EPIK 7 — System kredytowy: portfel i konsumpcja

**US-7.1** Jako system, chcę zawsze konsumować kredyt, który wygasa najwcześniej.
- AC1: Given klient ma dwa ważne kredyty tego samego typu z różnymi datami ważności, When system konsumuje kredyt na nową rezerwację, Then wybrany zostaje ten z wcześniejszym `valid_until` (FIFO).

**US-7.2** Jako system, chcę uniknąć podwójnej konsumpcji tego samego, ostatniego ważnego kredytu przy równoległych operacjach.
- AC1: Given klient ma dokładnie jeden ważny kredyt, When w tym samym momencie następuje auto-dopisanie i ręczna korekta admina, Then tylko jedna z dwóch operacji skutecznie konsumuje ten kredyt.

**US-7.3** Jako administrator, chcę ręcznie dodać kredyty klientowi z udokumentowanym powodem.
- AC1: Given wchodzę w profil klienta, When dodaję kredyty bez podania powodu, Then system odrzuca zapis (pole wymagane).
- AC2: Given kredyty zostały dodane, When sprawdzam audit trail, Then widoczne jest kto, komu, ile, jaki typ, jaki powód, kiedy.

**US-7.4** Jako rodzic z kilkorgiem dzieci, chcę mieć kredyty dostępne dla dowolnego z nich.
- AC1: Given kupuję pakiet i wybieram „dla dowolnego z moich dzieci", When kredyty są tworzone, Then `credit.athlete_id = NULL`.
- AC2: Given mam kredyt rodzinny i kredyt przypisany do konkretnego dziecka, When rezerwuję zajęcia dla tego dziecka, Then system priorytetyzuje dopasowanie do konkretnego dziecka przed kredytem rodzinnym.

**US-7.5** Jako rodzic, chcę przenieść niewykorzystany kredyt jednego dziecka na drugie.
- AC1: Given dziecko A ma niewykorzystany kredyt przypisany wyłącznie do niego, When składam wniosek o przeniesienie na dziecko B, Then wniosek trafia do kolejki admina/recepcji.
- AC2: Given próbuję przenieść kredyt na dziecko innego klienta, When składam wniosek, Then system odrzuca operację.
- AC3: Given admin zatwierdza wniosek, When zatwierdzenie następuje, Then `credit.athlete_id` jest aktualizowane, kredyt pozostaje `available`, a operacja jest logowana w audit trail.
- AC4: Given kredyt jest rodzinny (`athlete_id=NULL`), When rodzic próbuje złożyć wniosek o przeniesienie, Then mechanizm nie jest potrzebny.

**US-7.6** Jako klient, chcę widzieć swój portfel kredytów tylko wtedy, gdy faktycznie mam z czego korzystać.
- AC1: Given saldo `available` klienta = 0, When klient otwiera swój panel, Then sekcja „Portfel kredytów" nie jest widoczna.
- AC2: Given klient ma 2 kredyty z pakietu i 1 z odwołania zajęć, When otwiera portfel, Then widzi obie pozycje z osobnym źródłem i datą ważności.
- AC3: Given klient płaci online za pojedyncze zajęcia i płatność się powodzi, When sprawdza portfel, Then saldo pozostaje 0.
- AC4: Given klient ma nadchodzące potwierdzone zajęcia, When otwiera panel, Then sekcja „Nadchodzące zajęcia" jest zawsze widoczna, niezależnie od stanu portfela kredytów.

### EPIK 8 — Dopisanie (self-service)

**US-8.1** Jako klient, chcę dopisać się na dodatkowy termin w ramach typu, do którego należę.
- AC1: Given mam ważny, pasujący kredyt, When wybieram dodatkowy termin, Then system konsumuje istniejący kredyt (FIFO) zamiast kierować mnie do zakupu.
- AC2: Given nie mam pasującego, ważnego kredytu, When próbuję się dopisać, Then jestem kierowany do zakupu nowej jednostki, a rezerwacja finalizuje się dopiero po zakupie.
- AC3: Given wybrana sesja osiągnęła `capacity`, When próbuję się dopisać mimo posiadania ważnego kredytu, Then rezerwacja jest odrzucana.

### EPIK 9 — Zakup pakietu z auto-wypełnieniem terminów (Schedule-First)

**US-9.1** Jako klient, chcę kupić pakiet na moją stałą grupę i mieć automatycznie zarezerwowane najbliższe terminy.
- AC1: Given `group_type.engine=schedule_first` z jednym wzorcem, When kupuję pakiet `credit_quantity=4`, Then po potwierdzeniu płatności system podejmuje dokładnie jedną próbę zapisania mnie na 4 najbliższe, nieodbyte sesje tego wzorca.
- AC2: Given `group_type` ma więcej niż jeden wzorzec, When kupuję pakiet, Then muszę wskazać `target_recurrence_id`.
- AC3: Given próba zapisu na jeden z terminów napotyka pełną pojemność lub kolizję, When system to wykrywa, Then NIE ponawia próby — kredyt pozostaje `available`.
- AC4: Given część terminów została zarezerwowana, a część nie, When zakup się kończy, Then otrzymuję powiadomienie z dokładną listą.
- AC5: Given `group_type.engine` to `slot_first` lub `availability_first`, When kupuję pakiet, Then NIE następuje żadna próba auto-zapisu.

**US-9.2** Jako klient z subskrypcją, chcę, aby każde odnowienie ponownie próbowało zapisać mnie na najbliższe terminy.
- AC1: Given subskrypcja się odnawia (kolejny webhook `invoice.paid`), When nowe kredyty są generowane, Then ponownie wykonywana jest próba auto-wypełnienia.
- AC2: Given ten sam webhook odnowienia dociera dwukrotnie, When system go przetwarza, Then kredyty nie są generowane podwójnie.

### EPIK 10 — Zakup pakietu gotówką na miejscu

**US-10.1** Jako recepcja, chcę sprzedać klientowi pakiet gotówką bez integracji płatniczej.
- AC1: Given klient chce kupić pakiet na miejscu, When wybieram `product_template`, `athlete_id` (i `target_recurrence_id` jeśli dotyczy) i zatwierdzam otrzymanie gotówki, Then to zatwierdzenie jest jedynym potwierdzeniem płatności i jest logowane w audit trail.
- AC2: Given zatwierdzenie nastąpiło, When zadanie w tle przetwarza zakup, Then tworzone jest `credit_quantity` rekordów `credit`.

**US-10.2** Jako klient z zaległymi rezerwacjami „do zapłaty", chcę, aby zakup pakietu automatycznie je rozliczył.
- AC1: Given mam dwie rezerwacje `booked_offline` pasujące pod kupowany typ kredytu, When kupuję pakiet 4 kredytów gotówką, Then system najpierw automatycznie konsumuje kredyty FIFO na te dwie zaległe rezerwacje.
- AC2: Given po rozliczeniu zaległości zostały jeszcze 2 kredyty, When podano `target_recurrence_id`, Then dopiero teraz następuje próba auto-wypełnienia najbliższych terminów.
- AC3: Given po obu krokach zostały kredyty niewykorzystane, When zakup się kończy, Then trafiają one do portfela jako w pełni wolne.
- AC4: Given rozliczana jest każda zaległa rezerwacja, When konsumpcja następuje, Then przechodzi przez ten sam atomowy mechanizm blokady co standardowa konsumpcja FIFO.

### EPIK 11 — Zmiana Grupy (swap) — group_change_request

**US-11.1** Jako klient, chcę złożyć wniosek o zmianę terminu na inny.
- AC1: Given składam wniosek wskazując obecną rezerwację i docelową sesję, When wysyłam wniosek, Then tworzony jest `group_change_request` w statusie `submitted`.

**US-11.2** Jako administrator, chcę zweryfikować wykonalność wniosku i wyzwolić dalszy proces, bez samodzielnego ściągania pieniędzy od klienta.
- AC1: Given docelowa sesja jest pełna, When admin próbuje zatwierdzić wniosek, Then zatwierdzenie jest blokowane przez constraint pojemności (§5.2).
- AC2: Given admin zatwierdza wniosek, When zatwierdzenie następuje, Then `group_change_request.status → admin_approved`, a `price_difference` jest wyliczana i zamrażana w tym momencie.
- AC3: Given `price_difference > 0` (dopłata), When wniosek przechodzi w `admin_approved`, Then system NIE obciąża automatycznie żadnej zapisanej metody płatności klienta.
- AC4: Given admin odrzuca wniosek, When decyzja jest zapisywana, Then status → `admin_rejected` z wymaganym `rejection_reason`.

**US-11.3** Jako klient, chcę samodzielnie i świadomie opłacić różnicę wynikającą ze zmiany grupy, bez ryzyka automatycznego obciążenia.
- AC1: Given wniosek przeszedł w `admin_approved` z `price_difference > 0`, When system to przetwarza, Then generowana jest nowa `booking` na docelowej sesji ze statusem `payment_pending` i `price_snapshot` = pełna cena docelowej grupy, a kwota do faktycznej zapłaty jest tworzona jako osobny Stripe PaymentIntent na `price_difference`. `group_change_request.expires_at` ustawiane na `now() + 24h`.
- AC2: Given nowa `booking` istnieje w `payment_pending`, When sprawdzana jest pojemność docelowej sesji, Then ta rezerwacja liczy się jako aktywna i blokuje miejsce.
- AC3: Given klient otwiera link i płaci, When webhook Stripe potwierdza PaymentIntent, Then dopiero wtedy operacja jest finalizowana w jednej transakcji.
- AC4: Given `price_difference = 0`, When wniosek przechodzi w `admin_approved`, Then przesunięcie następuje od razu bez pośredniego kroku płatności.
- AC5: Given `price_difference < 0`, When wniosek przechodzi w `admin_approved`, Then swap jest finalizowany od razu, a różnica jest zwracana klientowi jako rzeczywisty zwrot pieniędzy.
- AC6: Given webhook PaymentIntent potwierdzający tę samą płatność dociera dwukrotnie, When system przetwarza drugą dostawę, Then sprawdza aktualny status przed zastosowaniem efektów.

**US-11.4** Jako administrator, chcę, aby niedopłacony wniosek nie blokował miejsca w nieskończoność.
- AC1: Given `group_change_request` w `awaiting_payment` ma `expires_at < now()`, When cykliczne zadanie w tle je sprawdza, Then status → `expired`, powiązana `payment_pending` `booking` → `cancelled`.
- AC2: Given wniosek wygasł, When operacja się kończy, Then klient otrzymuje powiadomienie, a oryginalna rezerwacja klienta pozostaje nietknięta.

**US-11.5** Jako klient lub administrator, chcę móc wycofać się z zatwierdzonej, ale jeszcze nieopłaconej zmiany grupy.
- AC1: Given wniosek jest w `admin_approved`/`awaiting_payment`, When klient anuluje go samodzielnie, Then status → `cancelled_by_client`, powiązana `booking` → `cancelled`.
- AC2: Given wniosek jest w tym samym stanie, When admin anuluje go, Then status → `cancelled_by_admin` z wymaganym `cancellation_reason`.
- AC3: Given wniosek został już sfinalizowany (`completed`), When ktokolwiek próbuje go anulować, Then operacja jest niedozwolona.

**US-11.6** Jako system, chcę bezpiecznie obsłużyć odwołanie sesji docelowej w trakcie oczekiwania klienta na płatność.
- AC1: Given admin odwołuje całą sesję, When istnieją powiązane `group_change_request` w `awaiting_payment`, Then każdy taki wniosek automatycznie przechodzi w `cancelled_by_admin`.
- AC2: Given powyższy scenariusz, When operacja się kończy, Then klient otrzymuje powiadomienie, a jego oryginalna rezerwacja pozostaje nietknięta.

**US-11.7** Jako administrator, chcę mieć pełny ślad audytowy każdej decyzji w cyklu życia wniosku.
- AC1: Given dowolne przejście stanu, When przejście następuje, Then jest ono logowane w audit trail (boilerplate §6.4).

**US-11.8** Jako klient, nie chcę móc jednocześnie odwoływać rezerwacji i zmieniać jej na inną grupę.
- AC1: Given moja rezerwacja ma już otwarty `group_change_request`, When próbuję odwołać tę samą rezerwację standardową ścieżką 24h, Then system odrzuca odwołanie.
- AC2: Given moja rezerwacja jest już w trakcie przetwarzania odwołania, When próbuję złożyć wniosek o zmianę grupy na tej samej rezerwacji, Then system odrzuca nowy wniosek.
- AC3: Given wniosek o zmianę grupy został anulowany/wygasł/odrzucony, When sprawdzam możliwość odwołania, Then odwołanie jest ponownie dostępne.

### EPIK 12 — Anulowanie i reguła 24h

**US-12.1** Jako klient, chcę odwołać zajęcia z odpowiednim wyprzedzeniem i otrzymać kredyt kompensacyjny — wyłącznie za to, co faktycznie opłaciłem.
- AC1: Given `session.start_time - now() >= 24h` oraz `booking.payment_status = confirmed` w momencie odwołania, When odwołuję rezerwację, Then `booking.payment_status → cancelled` i tworzony jest `credit` (`source=cancellation`).
- AC2: Given próbuję odwołać zajęcia mniej niż 24h przed startem, When wysyłam żądanie, Then system odrzuca odwołanie.
- AC3: Given `booking.payment_status = booked_offline`, When odwołuję ją, Then `payment_status → cancelled`, ale żaden kredyt kompensacyjny NIE jest generowany.
- AC4: Given odwołanie się powiodło, When slot trenera jest sprawdzany, Then jest on od razu dostępny dla innych rezerwacji.

**US-12.2** Jako administrator, chcę anulować rezerwację klienta, aby zwolnić miejsce dla innego uczestnika, bez karania anulowanego klienta — ale tylko jeśli było co kompensować.
- AC1: Given admin anuluje opłaconą (`confirmed`) rezerwację klienta X, When anulowanie następuje mniej niż 24h przed zajęciami, Then klient X i tak otrzymuje kredyt kompensacyjny.
- AC2: Given admin anuluje nieopłaconą (`booked_offline`) rezerwację klienta X, When anulowanie następuje, Then klient X nie otrzymuje kredytu.

**US-12.3** Jako system, chcę uniemożliwić odwołanie rezerwacji, która jest właśnie w trakcie zmiany na inną grupę.
- AC1: Given rezerwacja ma otwarty `group_change_request`, When klient lub admin próbuje ją odwołać standardową ścieżką, Then odwołanie jest blokowane.
- AC2: Given wniosek o zmianę grupy zostaje anulowany/wygasa/jest odrzucony, When sprawdzam ponownie możliwość odwołania, Then jest ono znów dostępne.

### EPIK 13 — Odrabianie

**US-13.1** Jako klient, chcę wykorzystać kredyt z odwołania na inny termin tego samego typu zajęć.
- AC1: Given mam kredyt `source=cancellation` typu „Piłka nożna Junior", When wybieram inny wzorzec tego samego typu, Then mogę wykorzystać kredyt tym samym mechanizmem co Dopisanie.
- AC2: Given próbuję wykorzystać ten kredyt na inny typ zajęć, When wybieram sesję niepasującego typu, Then system odrzuca.

### EPIK 14 — Ochrona przed race conditions (przekrój wszystkich ścieżek)

**US-14.1** Jako system, chcę zagwarantować, że żaden trener nigdy nie zostanie zapisany na dwie nakładające się sesje.
- AC1: Given trener ma sesję 17:00-18:00, When ktokolwiek próbuje utworzyć dla niego drugą sesję 17:30-18:30, Then baza danych odrzuca zapis (exclusion constraint).
- AC2: Given constraint odrzucił zapis, When aplikacja to wykrywa, Then klientowi zwracany jest komunikat „ten termin właśnie zajęto, wybierz inny".

**US-14.2** Jako system, chcę zagwarantować, że sesja nigdy nie przekroczy zdefiniowanej pojemności, nawet przy równoczesnych zapisach.
- AC1: Given sesja ma 1 wolne miejsce, When dwóch klientów klika „zapisz" w tym samym momencie, Then tylko jedna transakcja kończy się sukcesem.
- AC2: Given powyższy scenariusz dotyczy dowolnej ścieżki, When sprawdzam pokrycie, Then wszystkie ścieżki przechodzą przez ten sam mechanizm blokady.
- AC3: Given sesja jest pełna, When Owner/Admin próbuje wymusić zapis mimo pełnej pojemności, Then NIE istnieje żaden mechanizm obejścia dla żadnej roli.
- AC4: Given atomowa transakcja obejmuje blokadę sesji + sprawdzenie pojemności + konsumpcję kredytu + utworzenie bookingu, When którykolwiek krok zawiedzie, Then cała transakcja jest wycofywana.

**US-14.3** Jako system, chcę zagwarantować, że ten sam zawodnik nigdy nie zostanie zapisany na dwie nakładające się czasowo sesje.
- AC1: Given zawodnik ma aktywną rezerwację 17:00-18:00 na Typie A, When jest zapisywany na sesję 17:30-18:30 Typu B u innego trenera, Then baza odrzuca zapis.
- AC2: Given admin próbuje obejść to sprawdzenie, When próbuje zapisać tego samego zawodnika na nakładające się sesje, Then constraint nadal blokuje operację.
- AC3: Given godzina sesji jest edytowana, When zmiana jest zapisywana, Then zdenormalizowane `session_start_time`/`end_time` we wszystkich powiązanych `booking` są aktualizowane w tej samej transakcji.

**US-14.4** Jako administrator, chcę mieć legalny sposób przyjęcia dodatkowego uczestnika do pełnej sesji.
- AC1: Given sesja osiągnęła `capacity`, When podnoszę `session.capacity` o 1, Then nowy zapis może przejść przez standardowe sprawdzenie z podwyższonym limitem.
- AC2: Given podniosłem `capacity` i później ktoś się wypisze, When zwolnione miejsce jest sprawdzane, Then pozostaje ono dostępne dla kolejnego zapisu.
- AC3: Given podnoszę `capacity`, When wykonuję tę operację, Then wymagane jest uprawnienie `sessions.manage`.

**US-14.5** Jako administrator, chcę mieć jasność, że konflikt trenera i przekroczenie pojemności to dwa różne mechanizmy z różnymi zasadami.
- AC1: Given konflikt grafiku trenera, When Owner/Admin z uprawnieniem `sessions.force_override` próbuje wymusić zapis, Then system pozwala.
- AC2: Given przekroczenie pojemności grupy, When ten sam Owner/Admin próbuje użyć `sessions.force_override`, Then uprawnienie to NIE daje możliwości przyjęcia uczestnika ponad capacity.

### EPIK 15 — Brak listy rezerwowej

**US-15.1** Jako klient, chcę wiedzieć wprost, że miejsce jest niedostępne, bez dołączania do kolejki.
- AC1: Given sesja osiągnęła `capacity`, When próbuję się zapisać, Then formularz rezerwacji po prostu nie pozwala mi się zapisać.
- AC2: Given chcę mimo to skorzystać z tego typu zajęć, When sprawdzam dostępność, Then muszę wybrać inny termin tego samego wzorca albo poczekać na kolejny sezon.

### EPIK 16 — Panel trenera i recepcji

**US-16.1** Jako trener, chcę widzieć status płatności moich uczestników, ale nie musieć samodzielnie zatwierdzać gotówki.
- AC1: Given jestem trenerem prowadzącym zajęcia, When przeglądam listę uczestników, Then widzę statusy, ale zatwierdzenie płatności na miejscu wymaga uprawnienia `credits.confirm_on_site`.

**US-16.2** Jako trener/recepcja, chcę oznaczyć nieobecność uczestnika.
- AC1: Given klient nie pojawił się i nie odwołał zajęć, When oznaczam `no_show`, Then status jest zapisany, ale system nie wywołuje żadnej automatycznej konsekwencji.

### EPIK 17 — RBAC

**US-17.1** Jako administrator systemu, chcę mieć pewność, że uprawnienia są egzekwowane na backendzie, nie tylko ukrywane w UI.
- AC1: Given użytkownik bez uprawnienia `sessions.force_override` wysyła bezpośrednie żądanie API, When żądanie dociera do backendu, Then jest ono odrzucane niezależnie od tego, co pokazuje UI.
- AC2: Given żadna rola nie posiada uprawnienia „przekrocz pojemność sesji", When przeszukiwana jest mapa RBAC, Then takie uprawnienie nie istnieje w systemie.

### EPIK 18 — Zwroty fiducjarne

**US-18.1** Jako administrator, chcę wybrać wariant zwrotu osobno dla każdego przypadku.
- AC1: Given klient nie wykorzystał żadnego kredytu z zakupu, When wybieram wariant zwrotu, Then oba warianty dają identyczny wynik.
- AC2: Given klient wykorzystał część kredytów, When wybieram „zwrot częściowy", Then zwracana kwota = (niewykorzystane / zakupione) × `price_paid`.
- AC3: Given klient wykorzystał część kredytów na przyszłe rezerwacje, When wybieram „zwrot pełny z cofnięciem", Then niewykorzystane kredyty są unieważniane, a przyszłe rezerwacje z już skonsumowanych kredytów są cofane.

**US-18.2** Jako administrator, chcę, aby zwrot zakupu opłaconego online był rzeczywiście wykonany dopiero po potwierdzeniu przez bramkę płatności.
- AC1: Given `credit_purchase.payment_method = online`, zatwierdzam zwrot, When czekam na wynik, Then wybrany wariant jest stosowany dopiero po otrzymaniu webhooka `charge.refunded`.
- AC2: Given zwrot został potwierdzony, When sprawdzam `credit_purchase`, Then `refunded_at` i `refund_amount` są zaktualizowane.
- AC3: Given zwrot został potwierdzony, When klient sprawdza swoją skrzynkę, Then otrzymuje e-mail z kwotą i wariantem zwrotu (przez Notification Center).
- AC4: Given wywołanie Stripe Refund API kończy się błędem, When system otrzymuje odpowiedź błędu, Then zwrot NIE jest oznaczany jako wykonany.
- AC5: Given admin klika „zatwierdź zwrot", When system to przetwarza, Then w tej samej transakcji wszystkie niewykorzystane kredyty przechodzą w `status=pending_refund`.
- AC6: Given webhook `charge.refunded` potwierdza zwrot, When system go przetwarza, Then kredyty w `pending_refund` przechodzą w `refunded`; w razie błędu wracają do `available`.

**US-18.3** Jako administrator/recepcja, chcę zwrócić klientowi zakup opłacony gotówką.
- AC1: Given `credit_purchase.payment_method = cash`, When wybieram wariant zwrotu i klikam „Potwierdzam zwrot gotówki", Then to potwierdzenie jest źródłem prawdy.
- AC2: Given zwrot gotówkowy jest potwierdzany, When operacja się kończy, Then jest logowana w audit trail oraz klient otrzymuje powiadomienie.
- AC3: Given wybrany wariant to „zwrot pełny z cofnięciem", When jest stosowany dla zakupu gotówkowego, Then zasady cofania są identyczne jak dla zwrotu online.

### EPIK 19 — Powiadomienia

**US-19.1** Jako klient, chcę być informowany o zdarzeniach dotyczących moich rezerwacji.
- AC1: Given dowolne z: zatwierdzenie zmiany grupy, zatwierdzenie przeniesienia kredytu, odwołanie zajęć przeze mnie, zwrot potwierdzony, kredyt wygasa za 7 dni, częściowe auto-wypełnienie pakietu, zmiana lokalizacji zajęć, nieudana płatność subskrypcyjna, When zdarzenie następuje, Then otrzymuję odpowiednie powiadomienie zgodnie z moimi preferencjami kanałów (§2.16).

**US-19.2** Jako administrator, chcę, aby odwołanie całej sesji powiadomiło wszystkich naraz i zrekompensowało tych, którzy faktycznie zapłacili.
- AC1: Given admin odwołuje całą sesję, When operacja jest wykonywana, Then `session.status=cancelled`, a dla każdej powiązanej opłaconej `booking` generowany jest `credit` (`source=admin_session_cancellation`).
- AC2: Given wśród powiązanych rezerwacji są też `booked_offline`, When są anulowane wraz z sesją, Then kredyt kompensacyjny NIE jest dla nich generowany.
- AC3: Given odwołanie się powiodło, When operacja się kończy, Then wszyscy dotknięci klienci otrzymują powiadomienie jednocześnie.
- AC4: Given istnieją `group_change_request` w stanie `awaiting_payment` wskazujące odwoływaną sesję, When sesja jest odwoływana, Then zastosowanie ma US-11.6.

### EPIK 20 — Soft delete i archiwizacja

**US-20.1** Jako administrator, chcę dezaktywować typ zajęć/trenera/typ kredytu bez utraty historii.
- AC1: Given dezaktywuję `group_type`, When sprawdzam istniejące sesje/rezerwacje, Then pozostają one nietknięte.
- AC2: Given próbuję dezaktywować trenera z nadchodzącymi sesjami, When wykonuję operację, Then system pokazuje ostrzeżenie z listą sesji, ale nie blokuje twardo.
- AC3: Given dezaktywuję `credit_type`, When klient próbuje kupić nowy kredyt tego typu, Then zakup jest niedostępny, ale istniejące kredyty działają do naturalnego wygaśnięcia.

