### Faza 11 — Płatność online za pojedyncze zajęcia (EPIK 5)

**Status:** nierozpoczęta
**Cel:** klient płaci online za pojedyncze zajęcia; miejsce potwierdza wyłącznie webhook.
**Pokrywa:** EPIK 5; §2.4 (source `online_payment`); US-4.4 (metoda online w formularzu).
**Zależności:** F5 (booking `payment_pending`), F10 (Connect — checkout na Connected Account).
**Zakres:** generowanie Checkout na Connected Account organizacji (bramka §2.25); webhook potwierdzenia → w jednej transakcji: kredyt `online_payment` utworzony + skonsumowany + `booking → confirmed` (US-5.1/AC1); redirect NIGDY nie potwierdza (AC2); kredyt atomowy niewidoczny w portfelu (AC3); idempotencja przez `webhook_event`.
**DoD:** e2e: happy path online; redirect bez webhooka nie potwierdza; podwójna dostawa webhooka nie duplikuje kredytu; suita zielona.

---

