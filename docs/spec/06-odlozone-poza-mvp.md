## 6. Odłożone poza MVP

- Pełny, uniwersalny byt `client_request` obsługujący wiele typów wniosków jedną wspólną kolejką/audit trailem. Świadomie odłożone — nie zapomniane. Na MVP Zmiana Grupy dostała własny, dedykowany model `group_change_request` (§1.2, §EPIK 11) — to nie jest już obejście przez przeciążenie `booking.payment_status`, tylko pełnoprawny byt z własnym cyklem stanów. Odłożone pozostaje wyłącznie uogólnienie tego mechanizmu na inne typy wniosków: przeniesienie kredytu między dziećmi (§7.1a) — na MVP zostaje jako prostsza, osobna ścieżka zatwierdzenia; wspólna tabela nadrzędna (`client_request`) łącząca oba typy w jedną kolejkę UI dla admina.
- Agregacja powiadomień (Notification Batching) dla operacji masowych. Świadomie odłożone — na MVP każda operacja masowa wysyła powiadomienia zgodnie z już istniejącymi regułami per zdarzenie (§2.16), bez agregacji w jeden zbiorczy digest.
- Automatyczne fakturowanie/Stripe Tax (§2.17) — świadomie odłożone poza MVP na rzecz procesu ręcznego.
- **Utrzymywany licznik zużycia (zamiast liczenia na żywo) dla limitów planu (v13)** — optymalizacja wydajności, odłożona do momentu, gdy realna skala organizacji (liczba uczniów/grup) uzasadni koszt dodatkowej infrastruktury.
- **Automatyczne wymuszanie zgodności z limitem przy downgrade (v13)** — np. blokada samego downgrade'u zamiast tylko nowych operacji — świadomie uproszczone na MVP do modelu „miękkiej" blokady.
- **Express Connect jako alternatywa dla Standard (v14)** — szybszy, bardziej prowadzony onboarding dla mniejszych/mniej technicznych akademii, kosztem większej odpowiedzialności platformy (obsługa części sporów, wsparcia). Odłożone — Standard wystarcza na start, patrz §7 decyzja.
- **Powiadomienie o wygasającym rabacie klienta (v15)** — nowe zdarzenie w Notification Center (np. `client_discount_expiring`), informujące klienta, że jego indywidualna cena zaraz przestanie obowiązywać. Świadomie pominięte: rabat wygasa cicho, a pierwsze odnowienie po `valid_until` nalicza cenę katalogową bez uprzedzenia (§2.31, US-33.5/AC4). Odnotowane jako możliwe rozszerzenie — **nie projektowane teraz**.
- **UI raportów i analityki frekwencji oraz rentowności (v15)** — EPIK 31 dostarcza surowe dane frekwencyjne, ale ich zagregowana prezentacja (trendy obecności, rentowność grupy) pozostaje poza zakresem. To brak UI, nie brak danych.
- **Panel klienta z historią płatności (v15)** — dane (`credit_purchase`, `booking.price_snapshot`) już istnieją w modelu; brakuje wyłącznie widoku. Do zrobienia później.
- **Automatyczna opłata platformowa (`application_fee`) potrącana z każdej transakcji Connect (v14)** — model prowizji platformy od sprzedaży akademii. Świadomie poza MVP — na start langlion rozliczany jest wyłącznie przez opłatę za plan (§EPIK 29), nie prowizję transakcyjną; patrz §8 otwarte punkty.

---

