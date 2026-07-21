### Faza 10 — ⚠️ Stripe Connect per organizacja (EPIK 30; Zasada #7)

**Status:** nierozpoczęta
**Cel:** każda akademia podłącza WŁASNE konto Stripe (Standard Connect); platforma nigdy nie miesza go z kontem Platform Billing.
**Pokrywa:** EPIK 30 w całości; §2.24–§2.26; Constraint 7; spec §5 pkt 8b.
**Zależności:** F9 (kolejność spec 8a→8b; wspólny adapter).
**Zakres:** rozszerzenie kontraktu adaptera billingowego o operacje Connect (utworzenie/odnalezienie Standard account, link OAuth, wymiana kodu, tworzenie Checkout/PaymentIntent/Price **z jawnym wskazaniem konta docelowego** — parametr obowiązkowy, nie domyślny); kolumny `stripe_connect_account_id/status/charges_enabled/payouts_enabled/connected_at` na `organization`; routing webhooków: rozróżnienie eventów konta platformy vs Connected Account (US-30.4/AC2), obsługa `account.updated` → status (`onboarding_incomplete`/`active`/`restricted`/`disabled`) wyłącznie webhookiem, nigdy redirectem; sekcja „Płatności" w panelu (stały wskaźnik statusu); bramka §2.25 na backendzie (każda próba online-checkout odrzucana przy `status != active`; cash zawsze działa); uprawnienie `billing_connect.manage` wyłącznie owner (decyzja #14); powiadomienie `stripe_connect_requires_attention` (e-mail do F14).
**DoD:** e2e (offline, wzorzec podpisu HMAC jak `billing-webhook.spec.ts`): pełny cykl statusów przez `account.updated`; bramka odrzuca online przy każdym statusie ≠ active; admin bez uprawnienia nie widzi/nie wykona connect; testy jednostkowe rozróżnienia kont (Zasada #7); suita zielona.

---

