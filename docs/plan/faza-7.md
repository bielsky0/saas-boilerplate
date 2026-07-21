### Faza 7 — Dopisanie, anulowanie 24h, odrabianie, anulowania administracyjne

**Status:** nierozpoczęta
**Cel:** samoobsługowy cykl życia rezerwacji klienta + narzędzia admina.
**Pokrywa:** EPIK 8, 12, 13; US-19.2 (odwołanie sesji — kompensacja; powiadomienia e-mail-only, retrofit in-app w F14).
**Zależności:** F5 (booking), F4 (kredyty), F6 (panel — dla ścieżek admina).
**Zakres:** Dopisanie (Proces A) w panelu klienta — konsumpcja FIFO przez tę samą transakcję §5.2/§5.3; odwołanie przez klienta z regułą 24h (kredyt `cancellation` wyłącznie za `confirmed`; `booked_offline` → cancelled bez kredytu); odrabianie = Dopisanie kredytem `cancellation` w ramach tego samego `group_type`; anulowanie rezerwacji przez admina (kredyt niezależnie od 24h dla `confirmed`); odwołanie całej sesji przez admina (status `cancelled`, kredyty `admin_session_cancellation` dla opłaconych, e-maile do dotkniętych); uprawnienie `bookings.cancel_reschedule`.
**DoD:** e2e na wszystkie AC EPIK 12 (w tym granica 24h) i EPIK 8; odwołanie sesji generuje kredyty tylko dla opłaconych; suita zielona.

---

