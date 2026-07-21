## 5. Kolejność implementacji (rekomendowana)

1. Rozstrzygnięcie mapowania tożsamości boilerplate (§2.19) — decyzja architektoniczna, musi zapaść przed pisaniem RBAC. **Rozstrzygnięte (rewizja 14.1):** personel = boilerplate User+Membership; klient = domenowa encja `client` z OTP per organizacja.
2. Model danych fundamentalny: `organization` (z `currency`), `location`, `group_type`, `group_type_recurrence`, `session` + wszystkie 3 ochrony race condition (§5.1–§5.3) — kwoty od razu jako liczby całkowite, taniej teraz niż po migracji danych produkcyjnych.
3. Silnik Schedule-First + generowanie sesji jako efekt zapisu wzorca, z dziedziczeniem lokalizacji. Razem z tym punktem wchodzi `group_type.description` (v15) — prosta kolumna prezentacyjna, tania teraz, bo formularz CRUD typu grupy i tak powstaje.
4. Ścieżka klienta: formularz + upsert + OTP (domenowy, encja `client` — rewizja 14.1), start z płatnością na miejscu (bez integracji bramki).
5. System kredytowy: `credit_type`, `credit`, FIFO + atomowa konsumpcja — równolegle z punktem 4.
6. Panel trenera/recepcji: widoczność statusów + zatwierdzanie płatności na miejscu. Razem z tym punktem wchodzi **potwierdzanie obecności (EPIK 31, v15)** oraz **strona personelu e-dziennika (EPIK 35, v16)** — ta sama lista uczestników sesji jest nośnikiem obu (obecność, oceny, notatki o postępach). Powiadomienie klienta o nowej ocenie idzie od razu e-mailem (jak wszystkie zdarzenia na tym etapie, przed Notification Center); widoczność ocen/notatek w panelu klienta to osobny, mały retrofit w punkcie 11.
   **6a. Raport wynagrodzeń trenerów (EPIK 32, v15)** — zależny od punktu 6, ponieważ kwalifikacja sesji do raportu opiera się na danych frekwencyjnych (§2.30). Bez oznaczeń obecności raport nie ma na czym pracować.
7. Soft delete dla `group_type`, trenera, `credit_type`, `location` — tanio teraz, drogo później.
8. Płatność online (Stripe) jako rozszerzenie, przez adapter billingowy boilerplate'u — nie osobna integracja.
   **8a. Model planów i limitów (EPIK 29, v13)** — musi istnieć przed publicznym uruchomieniem, ponieważ bez niego brak mechanizmu ograniczającego użycie darmowego/niższego planu. Wymaga gotowego adaptera billingowego z punktu 8.
   **8b. Stripe Connect per organizacja (EPIK 30, v14)** — musi istnieć przed dopuszczeniem jakiejkolwiek akademii do przyjmowania płatności online od swoich klientów (punkt 9 poniżej blokuje się na tym warunku per organizacja, nie globalnie). Rozszerza ten sam adapter billingowy z punktu 8, ale operuje na odrębnej tożsamości Stripe (Connected Account) niż Platform Billing z punktu 8a — patrz Zasada nadrzędna #7.
9. Zakupy: `product_template` + pakiety jednorazowe → subskrypcje → auto-wypełnienie terminów (§7.5a); `allowed_purchase_modes`/`allowed_billing_types` wdrażane razem z tym punktem, przed publicznym uruchomieniem rejestracji z zakupem pakietów; obsługa `invoice.payment_failed` i `subscription_status` razem z tym punktem, przed publicznym uruchomieniem subskrypcji.
    **9a. Indywidualne ceny klienta (EPIK 33, v15)** — po punkcie 9, ponieważ rabat obejmuje nie tylko `group_type.price`, ale też `product_template.price`, w tym subskrypcje. Przed startem tego punktu musi zapaść decyzja o mechanice Stripe dla rabatu na subskrypcji (§8, otwarty punkt).
10. Anulowanie + odrabianie (Proces A), w tym anulowanie administracyjne zwalniające miejsce.
11. Widoczność portfela kredytów w UI. Razem z tym punktem wchodzi **retrofit widoczności ocen i notatek o postępach w panelu klienta (EPIK 35, v16)** — pierwsza faza budująca ogólny panel klienta; warunek widoczności sekcji do rozstrzygnięcia (§8, analogicznie do widoczności portfela z §7.6).
12. Notification Center jako dedykowana encja (§2.16) — zamiast generycznego mechanizmu z boilerplate §23, rozszerzone o zdarzenie zmiany lokalizacji, nieudanej płatności **i limitów planu (v13)**.
13. Proces B: Zmiana Grupy + przeniesienie kredytu między dziećmi.
14. Zwroty fiducjarne (po konsultacji prawnej — prawo konsumenckie).
15. Regulaminy i akceptacje (§2.18) — musi być gotowe przed pierwszym publicznym zapisem klienta, jeśli akademia wymaga akceptacji regulaminu prawnie.
    **15a. Dyspozycyjność trenerów (EPIK 34, v16)** — poprzedza silniki Availability-First i Slot-First (punkt 16), ponieważ Slot-First konsumuje policzone sloty (`trainer_availability` + kolumny `group_type.default_duration_minutes/default_capacity` + warstwa liczenia slotów, Constraint 11). Bez tej warstwy Slot-First nie realizuje swojego celu biznesowego (klient widzi realne sloty zamiast zgadywać).
16. Silniki Availability-First i Slot-First — wpięte w warstwę dostępności z punktu 15a (SF: podpowiedź slotów; AF: miękkie ostrzeżenie).
17. Force Override + audit trail (wyłącznie konflikt trenera) — wykorzystujący wspólny hook boilerplate §6.4.
18. Warunkowe UI formularza rejestracji odzwierciedlające `allowed_purchase_modes` — ostatni krok, zależny od punktu 9.
19. Proces ręcznego fakturowania (§2.17) — czysto administracyjny, niski priorytet, nie blokuje ścieżki zakupowej klienta.

**Poprawki konkurencyjne (v17)** — wpinają się w powyższą kolejność, nie tworząc osobnego bloku fazowego poza jednym retrofitem:

20. **Retrofit ścieżki publicznej (EPIK 36 zapisy-zainteresowanie + EPIK 40 zapis wielu dzieci)** — jeden wspólny powrót do formularza publicznego z punktu 4/3, bo obie poprawki dotykają tego samego kodu; łączone celowo, by nie wracać do niego dwukrotnie.
21. **Profil uczestnika i zgody (EPIK 37)** — po punkcie 4 (formularz istnieje) i **przed** importem (punkt 22 musi pokrywać nowe pola profilu); edycja z panelu klienta dochodzi razem z punktem 11.
22. **Import masowy CSV (EPIK 39)** — po punkcie 21 (import konsumuje pola profilu, nie wprowadza ich niezależnie); izolowane narzędzie administracyjne.
23. **Granularne uprawnienia — override overlay (EPIK 38)** — wąskie, izolowane odejście od Rozstrzygnięcia #4 (statyczna mapa zostaje bazą); może wejść w dowolnym momencie, bo nakładka nie usuwa mapy, ale jako praca na współdzielonym RBAC nie łączy się z inną fazą.
24. **Stawka godzinowa trenera (US-32.6, `trainer_rate.rate_type`)** — dołożenie zakresu do punktu 6a (raport wynagrodzeń), nie osobna faza; `trainer_rate` i tak powstaje tam po raz pierwszy.

**Poprawki konkurencyjne (v18)** — trzy dalsze poprawki (ActiveNow) + przegląd zakresu odłożonego, każda jako osobna faza po swoich zależnościach (nie tworzą wspólnego bloku):

25. **Tematy lekcji i prace domowe (EPIK 43)** — po punkcie 6 (panel personelu / strona e-dziennika EPIK 35), bo dzieli z e-dziennikiem nośnik (lista uczestników sesji §16.1) i wzorzec uprawnień; osobne od ocen/notatek. Widoczność u klienta = retrofit razem z panelem klienta (punkt 11).
26. **Opłaty dodatkowe ad-hoc (EPIK 42)** — po punkcie 8b (Stripe Connect) i punkcie 8/9 (płatność online / ad-hoc `price_data`), bo online `extra_fee` idzie na Connected Account. Poza systemem kredytowym (Rozstrzygnięcie #35); fakturowanie wpina się w punkt 19 (§2.17). Brak mechanizmu zwrotu (Rozstrzygnięcie #33).
27. **Moduł obozów: karta kwalifikacyjna (EPIK 41)** — po punkcie odpowiadającym profilowi uczestnika i zgodom (EPIK 37, dane wrażliwe + `athlete_health.view` + `consent_document`/`athlete_consent`), bo karta reużywa tę bramkę i encje zgód, oraz po ścieżce publicznego zapisu (punkt 4). Eksport PDF reużywa storage (§21).

---

