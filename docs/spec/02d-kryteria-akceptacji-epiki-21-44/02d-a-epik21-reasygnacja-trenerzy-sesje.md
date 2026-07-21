### EPIK 21 — Reasygnacja: trenerzy, sesje, dezaktywacja Definicji

Opis funkcjonalności: [część 1](../02a-opis-funkcjonalnosci-cz1.md), [część 2](../02b-opis-funkcjonalnosci-cz2.md). Wcześniejsze kryteria: [EPIK 1–20](../02c-kryteria-akceptacji-epiki-1-20.md).


**US-21.1** Jako administrator, chcę dezaktywować profil trenera, ale nie stracić kontroli nad jego przyszłymi zajęciami.
- AC1: Given trener ma co najmniej jedną przyszłą, nieodbytą sesję, When próbuję dezaktywować jego profil, Then operacja jest blokowana.
- AC2: Given rozwiązałem wszystkie przyszłe sesje trenera, When ponawiam dezaktywację, Then operacja się powodzi.
- AC3: Given trener nie ma żadnych przyszłych sesji, When dezaktywuję jego profil od razu, Then operacja przechodzi bez blokady.
- AC4: Given lista blokujących sesji, When rozwiązuję je wyłącznie częściowo i próbuję ponowić dezaktywację, Then operacja nadal jest blokowana.

**US-21.2** Jako administrator, chcę zmienić trenera w pojedynczej sesji.
- AC1: Given zmieniam trenera w konkretnej `session`, When nowy trener ma kolizję czasową, Then operacja jest odrzucana przez constraint §5.1.
- AC2: Given nowy trener jest wolny w tym terminie, When zapisuję zmianę, Then sesja jest zaktualizowana, a operacja logowana w audit trail.

**US-21.3** Jako administrator, chcę zmienić trenera dla wielu przyszłych sesji na raz, bez ryzyka, że jedna kolizja zablokuje całą operację.
- AC1: Given wskazuję nowego trenera dla N przyszłych sesji, When operacja jest wykonywana, Then każda sesja jest aktualizowana w osobnej transakcji.
- AC2: Given jedna z N sesji koliduje z istniejącym grafikiem nowego trenera, When system to wykrywa, Then tylko ta sesja jest pomijana.
- AC3: Given operacja się kończy, When admin sprawdza wynik, Then widzi zbiorczy raport.
- AC4: Given zmiana trenera dotyczy sesji z aktywnymi rezerwacjami, When operacja się powiedzie, Then klienci NIE otrzymują dodatkowego, natychmiastowego powiadomienia poza standardowymi regułami z §2.16.

**US-21.4** Jako administrator, chcę odwołać sesję i wybrać, czy kompensować kredytem, czy przenieść uczestników.
- AC1: Given odwołuję sesję standardowo, When operacja się kończy, Then stosowane są zasady z §2.11/US-19.2.
- AC2: Given wybieram opcję „Przenieś uczestników" i wskazuję sesję docelową tego samego `group_type`, When operacja jest wykonywana, Then dla każdego uczestnika osobno sprawdzane są capacity i kolizja zawodnika.
- AC3: Given uczestnik przechodzi oba sprawdzenia, When jest przenoszony, Then jego istniejąca `booking` jest aktualizowana (UPDATE), nie anulowana i tworzona od nowa.
- AC4: Given uczestnik nie mieści się w sesji docelowej lub ma kolizję, When system to wykrywa, Then ten uczestnik NIE jest przenoszony automatycznie i NIE otrzymuje automatycznego kredytu.
- AC5: Given próbuję wskazać sesję docelową innego `group_type`, When wybieram cel, Then operacja jest niedostępna.
- AC6: Given operacja się kończy, When admin sprawdza wynik, Then widzi zbiorczy raport.

**US-21.5** Jako administrator, chcę mieć pewność, że masowa aktualizacja grafiku nigdy nie nadpisze cichym błędem ręcznej korekty, którą wcześniej świadomie wprowadziłem.
- AC1–AC2: patrz §3.4/AC8–AC9 (flaga `is_manually_adjusted`, obejmująca odtąd również lokalizację).
- AC3: patrz §3.4/AC10 — Force Override nie ustawia tej flagi.

**US-21.6** Jako administrator, chcę mieć pewność, że nie da się „po cichu" dezaktywować oferty, która nadal jest w użyciu.
- AC1: Given `group_type` ma powiązany `group_type_recurrence` z `is_recurring=true`, When próbuję dezaktywować `group_type`, Then operacja jest blokowana.
- AC2: Given `group_type` ma przyszłe, nieodbyte sesje, When próbuję dezaktywować, Then operacja jest blokowana.
- AC3: Given zatrzymałem generowanie i rozwiązałem wszystkie przyszłe sesje, When ponawiam dezaktywację, Then operacja się powodzi.
