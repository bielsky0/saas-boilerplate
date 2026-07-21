### Faza 16 — Zwroty fiducjarne (EPIK 18)

**Status:** nierozpoczęta
**Cel:** zwroty częściowe i pełne z cofnięciem, ze źródłem prawdy zależnym od metody płatności.
**Pokrywa:** EPIK 18; §2.9; spec §5 pkt 14. **Uwaga spec:** wdrożenie po konsultacji prawnej (prawo konsumenckie).
**Zależności:** F12 (credit_purchase), F14 (powiadomienia `refund_confirmed`).
**Zakres:** warianty zwrotu (formuła `(niewykorzystane / zakupione) × price_paid` w integerach), atomowe `available → pending_refund` przy inicjacji; online: Stripe Refund API na Connected Account + webhook `charge.refunded` jako źródło prawdy (błąd API → powrót do `available`); cash: klik admina źródłem prawdy (`refund_confirmed_by_user_id`); pełny z cofnięciem: unieważnienie niewykorzystanych + cofnięcie przyszłych rezerwacji; uprawnienie `refunds.issue`; audyt.
**DoD:** e2e na AC US-18.1–18.3 (webhook offline jak w F10); suita zielona.

---

