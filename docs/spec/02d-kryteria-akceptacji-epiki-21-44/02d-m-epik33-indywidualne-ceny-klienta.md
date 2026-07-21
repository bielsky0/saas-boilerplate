### EPIK 33 — Indywidualne ceny klienta (v15)

**US-33.1** Jako administrator, chcę przyznać wynegocjowany rabat konkretnemu klientowi.
- AC1: Given rozmawiałem z klientem poza systemem i mam uprawnienie `client_price_override.manage`, When przyznaję rabat z profilu tego klienta, Then powstaje `client_price_override` z `granted_by_user_id` i datami obowiązywania.
- AC2: Given wypełniam formularz rabatu bez podania `reason`, When zapisuję, Then system odrzuca zapis — powód jest wymagany, analogicznie do `credits.manual_grant` (§US-7.3).
- AC3: Given rabat został przyznany, When sprawdzam audit trail, Then widoczne jest kto, komu, jaki typ i wartość, jaki zasięg, na jaki okres i z jakim powodem.
- AC4: Given nie mam uprawnienia `client_price_override.manage`, When wysyłam żądanie bezpośrednio przez API, Then jest odrzucane niezależnie od UI.

**US-33.2** Jako administrator, chcę zdecydować, czy rabat dotyczy jednej oferty, czy całej akademii.
- AC1: Given tworzę override ze wskazanym `group_type_id`, When klient kupuje inną ofertę, Then płaci cenę katalogową.
- AC2: Given tworzę override bez `group_type_id` (NULL), When klient kupuje dowolną ofertę akademii, Then rabat obowiązuje wszędzie.
- AC3: Given klient A ma rabat na daną ofertę, When klient B zapisuje się na tę samą ofertę, Then widzi i płaci cenę katalogową — rabat nie jest ofertą grupy, tylko ustaleniem indywidualnym.
- AC4: Given istnieje zarówno override dla `(client_id, group_type_id)`, jak i dla `(client_id, NULL)`, When wyliczana jest cena tej konkretnej oferty, Then wygrywa override wskazujący `group_type_id` (Constraint 9).

**US-33.3** Jako klient z przyznanym rabatem, chcę zapłacić obniżoną cenę za pojedyncze zajęcia.
- AC1: Given mam aktywny override `percent_discount` = 20, a `group_type.price` = 100 zł, When rezerwuję zajęcia, Then płacę 80 zł.
- AC2: Given mam aktywny override `fixed_price` = 60 zł, When rezerwuję zajęcia z ceną katalogową 100 zł, Then płacę 60 zł niezależnie od ceny katalogowej.
- AC3: Given nie mam żadnego pasującego, aktywnego override, When rezerwuję zajęcia, Then płacę cenę katalogową — brak rabatu nigdy nie blokuje zakupu (fail-open, Constraint 9).
- AC4: Given rezerwacja została utworzona z rabatem, When sprawdzam `booking.price_snapshot`, Then zamrożona jest cena PO rabacie wraz z walutą (§2.14).
- AC5: Given moja rezerwacja ma zamrożony `price_snapshot`, When admin później zmienia lub wyłącza mój rabat, Then ta rezerwacja pozostaje nietknięta (Zasada nadrzędna #1).

**US-33.4** Jako klient z przyznanym rabatem, chcę kupić pakiet w obniżonej cenie.
- AC1: Given mam aktywny override pasujący do typu grupy powiązanego z pakietem, When kupuję `product_template` jednorazowo, Then `credit_purchase.price_paid` zapisuje kwotę po rabacie.
- AC2: Given kupiłem pakiet z rabatem i wnioskuję o zwrot, When wyliczana jest kwota zwrotu (§2.9), Then formuła `(niewykorzystane / zakupione) × price_paid` operuje na kwocie faktycznie zapłaconej, nie katalogowej.
- AC3: Given liczba wygenerowanych kredytów zależy od `credit_quantity`, When kupuję pakiet z rabatem, Then otrzymuję tę samą liczbę kredytów co bez rabatu — rabat zmienia wyłącznie cenę, nigdy zawartość pakietu.

**US-33.5** Jako klient z subskrypcją i rabatem, chcę, aby rabat obowiązywał w kolejnych cyklach, dopóki jest ważny.
- AC1: Given mam aktywną subskrypcję i aktywny override, When następuje odnowienie (`invoice.paid`, §2.15), Then naliczana kwota uwzględnia stan override'a **w momencie tego odnowienia**, nie w momencie założenia subskrypcji.
- AC2: Given admin zmienia wartość mojego rabatu między cyklami, When następuje kolejne odnowienie, Then nowa kwota jest naliczana zgodnie ze zmienioną wartością — zmienna cena między cyklami jest zachowaniem oczekiwanym, nie błędem.
- AC3: Given mój override ma `valid_until` w przeszłości względem momentu odnowienia, When następuje odnowienie, Then naliczana jest pełna cena katalogowa, bez żadnej akcji admina.
- AC4: Given rabat wygasł i naliczono pełną cenę, When sprawdzam swoją skrzynkę i Notification Center, Then NIE otrzymuję powiadomienia o wygaśnięciu rabatu — świadomie pominięte na tym etapie (§6).
- AC5: Given rabat wygasł lub został wyłączony, When sprawdzam już wygenerowane kredyty z poprzednich cykli, Then pozostają nietknięte i ważne do swojego `valid_until`.
- AC6 (v15): Given zmieniam `group_type.price` lub `product_template.price`, When istnieją klienci z aktywnym `client_price_override` typu `percent_discount` na ten `group_type` i aktywną subskrypcją `recurring`, Then system przelicza i synchronizuje `unit_amount` na ich `subscription_item` przez `price_data` (Constraint 10), bez oczekiwania na najbliższe odnowienie.
- AC7 (v15): Given dwie zmiany dotyczące tej samej pary `(client_id, credit_purchase_id)` docierają niemal jednocześnie, When oba zadania synchronizacji są przetwarzane, Then stosowane są sekwencyjnie (Constraint 10) — nigdy równolegle na tym samym `subscription_item`.

**US-33.6** Jako administrator, chcę wycofać rabat bez naruszania historii.
- AC1: Given ustawiam `is_active=false` na istniejącym override, When klient dokonuje kolejnego zakupu, Then płaci cenę katalogową.
- AC2: Given override ma `valid_until` w przeszłości, When klient dokonuje zakupu, Then efekt jest identyczny jak przy `is_active=false` — oba mechanizmy działają tak samo, od następnego zakupu.
- AC3: Given wyłączam rabat, When sprawdzam wcześniejsze `booking.price_snapshot` i `credit_purchase.price_paid` tego klienta, Then pozostają niezmienione.

**US-33.7** Jako właściciel platformy, chcę mieć pewność, że rabat nigdy nie jest samoobsługowy.
- AC1: Given jestem klientem, When przeglądam panel i formularz rejestracji, Then nie istnieje żadna ścieżka UI ani API pozwalająca mi zgłosić wniosek o rabat, wpisać kod promocyjny ani samodzielnie zastosować zniżkę.
- AC2: Given mam przyznany rabat, When dokonuję zakupu, Then stosuje się on automatycznie do każdego pasującego zakupu, bez żadnej akcji z mojej strony.
- AC3: Given admin przyznał mi rabat, When sprawdzam, od kiedy obowiązuje, Then obowiązuje na wszystkie kolejne rozpoznania mojego konta (kolejny zapis, dopisanie następnego dziecka, nowy sezon), a nie wyłącznie na najbliższy zakup — aż do wygaśnięcia lub wyłączenia (§2.31).
