### Faza 19 — Warunkowe UI formularza + fakturowanie ręczne

**Status:** nierozpoczęta
**Cel:** domknięcie ogona: formularz w pełni odzwierciedla politykę zakupową; administracyjny proces faktur.
**Pokrywa:** spec §5 pkt 18–19; EPIK 27; US-4.4/AC4, US-23.3.
**Zależności:** F12.
**Zakres:** pełne warunkowe renderowanie formularza wg `allowed_purchase_modes`/`allowed_billing_types` (+ komunikat „brak dostępnych pakietów"); żądanie faktury przez klienta (`invoice_requested_at`), lista oczekujących dla recepcji, oznaczenie wystawienia (`invoice_issued_*`, uprawnienie `invoices.mark_issued`); nic z tego nie blokuje ścieżki zakupowej.
**DoD:** e2e na AC EPIK 27 i US-23.3; suita zielona.

---

