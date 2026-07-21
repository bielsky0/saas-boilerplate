### Faza 15 — Zmiana Grupy (swap) + przeniesienie kredytu między dziećmi

**Status:** nierozpoczęta
**Cel:** Proces B — wniosek, decyzja admina, świadoma dopłata/zwrot, finalizacja webhookiem.
**Pokrywa:** EPIK 11; §2.7; §7.1a (przeniesienie kredytu — US-7.5); spec §5 pkt 13.
**Zależności:** F7 (wzajemne wykluczenie z odwołaniem), F11 (PaymentIntent dopłaty), F14 (powiadomienia), F16 dla `price_difference < 0` — zwrot można w tej fazie oznaczyć jako zależny od F16 albo zrealizować wspólny mechanizm zwrotu tu i reużyć w F16 (decyzja na starcie fazy).
**Zakres:** `group_change_request` (pełny cykl: submitted → admin_approved/admin_rejected → awaiting_payment → completed/expired/cancelled_by_*), zamrożenie `price_difference`, booking `payment_pending` blokujący miejsce + `expires_at` 24h (decyzja #3), cron wygaszania, anulowania obustronne, kaskada przy odwołaniu sesji docelowej (US-11.6), wzajemne wykluczenie z odwołaniem (US-11.8/US-12.3), idempotencja webhooka dopłaty, audyt każdego przejścia stanu (US-11.7), uprawnienie `group_swap.approve`; przeniesienie kredytu między dziećmi: wniosek rodzica → zatwierdzenie (`credits.reassign_athlete`) → update `athlete_id` + audyt.
**DoD:** e2e na AC US-11.1–11.8 i US-7.5; suita zielona.

---

