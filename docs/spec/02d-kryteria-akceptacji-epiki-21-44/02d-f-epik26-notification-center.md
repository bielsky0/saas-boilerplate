### EPIK 26 — Notification Center (dedykowana encja domenowa)

**US-26.1** Jako klient, chcę wybrać, którym kanałem chcę być informowany o zdarzeniach dotyczących moich rezerwacji.
- AC1: Given otwieram ustawienia powiadomień, When zmieniam preferencję dla `credit_expiring_soon` na wyłącznie e-mail, Then kolejne zdarzenia tego typu nie generują wpisu in-app, tylko e-mail.
- AC2: Given próbuję wyłączyć oba kanały dla `refund_confirmed`, When zapisuję preferencję, Then system odrzuca zmianę — to zdarzenie ma `is_overridable=false`.

**US-26.2** Jako system, chcę generować powiadomienie z jednego, spójnego punktu przy każdym zdarzeniu biznesowym, zamiast rozproszonej logiki wysyłkowej.
- AC1: Given dowolne zdarzenie z tabeli mapowania w §2.16 następuje, When jest przetwarzane, Then tworzony jest dokładnie jeden rekord `notification` na odbiorcę.
- AC2: Given zdarzenie dotyczy wielu odbiorców jednocześnie, When jest przetwarzane, Then każdy odbiorca otrzymuje osobny rekord `notification`, wysyłane w ramach tej samej operacji.

**US-26.3** Jako klient, chcę widzieć nieprzeczytane powiadomienia w panelu, z licznikiem.
- AC1: Given mam 3 nieprzeczytane powiadomienia, When otwieram panel, Then widzę licznik „3" i listę, z możliwością oznaczenia pojedynczo lub zbiorczo jako przeczytane.
