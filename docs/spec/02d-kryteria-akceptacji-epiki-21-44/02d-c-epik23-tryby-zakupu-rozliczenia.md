### EPIK 23 — Tryby zakupu i rozliczenia per typ grupy

**US-23.1** Jako administrator, chcę zdefiniować, czy klient może kupić pojedyncze zajęcia, pakiet, czy oba warianty dla danego typu grupy.
- AC1: Given tworzę/edytuję `group_type`, When nie zaznaczę żadnej wartości w `allowed_purchase_modes`, Then system odrzuca zapis.
- AC2: Given ustawiam wyłącznie `package`, When klient próbuje zarezerwować zajęcia tego typu bez posiadania ważnego, pasującego kredytu, Then jedyna dostępna ścieżka to zakup pakietu.
- AC3: Given ustawiam wyłącznie `single_class`, When klient rezerwuje zajęcia, Then płaci każdorazowo za pojedyncze wejście — zakup pakietu nie jest oferowany.
- AC4: Given ustawiam oba tryby, When klient przegląda ofertę, Then widzi zarówno opcję jednorazowej płatności, jak i zakupu pakietu.

**US-23.2** Jako administrator, chcę ograniczyć, jakie rodzaje rozliczenia pakietu są dostępne dla danego typu grupy.
- AC1: Given `allowed_purchase_modes` zawiera `package`, When zapisuję `group_type` bez wskazania `allowed_billing_types`, Then system odrzuca zapis.
- AC2: Given ustawiam `allowed_billing_types = {one_time}`, When administrator próbuje utworzyć `product_template` z `billing_type=recurring` powiązany z tym typem grupy, Then zapis jest odrzucany.
- AC3: Given `allowed_purchase_modes` NIE zawiera `package`, When administrator próbuje utworzyć jakikolwiek `product_template` powiązany z tym typem grupy, Then zapis jest odrzucany.

**US-23.3** Jako klient, chcę widzieć przy zakupie pakietu wyłącznie te opcje rozliczenia, które akademia faktycznie oferuje dla tej grupy.
- AC1: Given typ grupy dopuszcza wyłącznie `recurring`, When klient przegląda ofertę pakietów, Then widzi wyłącznie opcję subskrypcji.
- AC2: Given typ grupy dopuszcza oba warianty, When klient przegląda ofertę, Then widzi wszystkie aktywne `product_template` powiązane z tym typem grupy, pogrupowane wg `billing_type`.

**US-23.4** Jako administrator, chcę mieć pewność, że nie da się włączyć trybu pakietowego bez faktycznie istniejącego pakietu do kupienia.
- AC1: Given ustawiam `allowed_purchase_modes = {package}`, ale nie istnieje żaden aktywny `product_template` powiązany z jego `credit_type`, When klient próbuje zarezerwować zajęcia, Then system pokazuje komunikat „brak dostępnych pakietów — skontaktuj się z akademią".
- AC2: Given administrator próbuje opublikować typ grupy w tym stanie, When zapisuje zmianę, Then system pokazuje ostrzeżenie (nie twardą blokadę).

**US-23.5** Jako administrator, chcę zmienić tryb zakupu typu grupy bez wpływu na już opłacone rezerwacje.
- AC1: Given klient ma aktywną rezerwację opłaconą w trybie `single_class`, When administrator zmienia `group_type.allowed_purchase_modes` na wyłącznie `package`, Then istniejąca rezerwacja i jej `price_snapshot` pozostają nietknięte.
- AC2: Given zmiana wchodzi w życie, When kolejny klient próbuje zarezerwować ten typ grupy, Then stosowana jest nowa polityka.

**US-23.6** Jako administrator, chcę zmienić `allowed_purchase_modes`/`allowed_billing_types` bez wpływu na klientów, którzy już kupili — w tym tych z aktywną subskrypcją.
- AC1: Given klient ma aktywną subskrypcję, When administrator usuwa `recurring` z `allowed_billing_types` tego typu grupy, Then subskrypcja nadal odnawia się normalnie.
- AC2: Given administrator zapisuje zmianę polityki, When nowy klient (jeszcze bez żadnego zakupu tego typu grupy) otwiera formularz rejestracji, Then widzi wyłącznie tryby/rozliczenia zgodne z nową, aktualną polityką.
- AC3: Given istnieje `product_template` z `billing_type` niezgodnym z nową polityką (utworzony przed zmianą, nadal `is_active=true`), When jakikolwiek klient bez wcześniej aktywnego zakupu tego typu próbuje go kupić, Then zakup jest blokowany.
- AC4: Given klient z aktywną subskrypcją anuluje ją, When później chce ponownie zasubskrybować ten sam typ grupy, Then jest to traktowane jako nowy zakup podlegający polityce aktualnej w tym momencie.
- AC5: Given zmiana polityki na typie grupy, When sprawdzam stan `product_template` powiązanych z tym typem, Then żaden z nich nie jest automatycznie dezaktywowany przez samą zmianę polityki.
- AC6: Given administrator zawęża `allowed_purchase_modes`, When klient ma w toku rezerwację `payment_pending` opartą o starą politykę, Then ta rezerwacja i jej link płatności pozostają ważne i finalizują się normalnie.
