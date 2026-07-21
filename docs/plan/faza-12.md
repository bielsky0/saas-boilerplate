### Faza 12 — Pakiety i subskrypcje (EPIK 9, 10, 23, 25)

**Status:** nierozpoczęta
**Cel:** sprzedaż pakietów (gotówka + online + subskrypcje) z auto-wypełnieniem terminów.
**Pokrywa:** EPIK 9, 10, 23, 25; §2.5, §2.6, §2.13, §2.15; spec §5 pkt 9.
**Zależności:** F4 (kredyty), F6 (recepcja), F11 (checkout online).
**Zakres (podfazami wewnątrz, w tej kolejności):**
a) `product_template` (walidacja Constraint 4: `billing_type` ⊆ `allowed_billing_types`; feature gating `subscriptions_enabled` z F9; blokada online-template przy braku Connect) + `credit_purchase`;
b) zakup gotówką (US-10.x): zatwierdzenie recepcji = źródło prawdy, job w tle: rozliczenie zaległych `booked_offline` FIFO → auto-fill §7.5a (jednorazowa, nieponawiana próba per termin, przez pełną ochronę §5) → reszta do portfela;
c) pakiety online one-time na Connected Account (webhook → kredyty → auto-fill);
d) subskrypcje: `stripe_subscription_id` na Connected Account, `invoice.paid` → kredyty + auto-fill (idempotencja §12.3/US-9.2), `invoice.payment_failed` → `subscription_status=past_due` + e-mail z linkiem do Customer Portal (US-25.x; kredyty nigdy nie są cofane), `customer.subscription.deleted` → `canceled`;
e) nieretroaktywność zmian polityki (US-23.5/23.6) + ostrzeżenie „package bez aktywnego template" (US-23.4).
**Wymóg z Rozstrzygnięcia #20 (dotyczy podfaz c i d):** ścieżka checkoutu pakietowego musi dopuszczać ad-hoc `price_data` jako alternatywę dla `product_template.stripe_price_id` **już od startu tej fazy**, nie dopiero w F21 — to jedyny sposób wyrażenia rabatu per klient zmiennego między cyklami (§2.31). Zbudowanie jej wyłącznie wokół gotowego `stripe_price_id` wymusi w F21 przeprojektowanie zamiast rozszerzenia (patrz „Ryzyka techniczne", ostatni punkt).
**DoD:** e2e na AC EPIK 9/10/23/25 (w tym częściowy auto-fill z powiadomieniem e-mail, podwójny webhook odnowienia bez duplikatów); suita zielona.

---

