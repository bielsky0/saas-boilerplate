### Faza 9 — ⚠️ Plany i limity jako dane w DB (EPIK 29; odejście od plans.ts)

**Status:** nierozpoczęta
**Cel:** definicje planów/limitów/featur w bazie, edytowalne przez Super Admina bez deploya (Zasady #5/#6); egzekwowanie limitów na backendzie.
**Pokrywa:** EPIK 29 w całości; §2.20–§2.23; spec §5 pkt 8a.
**Zależności:** istniejący adapter billingowy (Platform Billing); zasoby limitowane z F2–F5 (athlete, group_type, trenerzy, location, session).
**Zakres:** tabele `plan`, `plan_limit_definition`, `plan_feature_flag`, `organization_limit_override`; `organization.plan_id` NOT NULL (migracja: seed planu `trial` + backfill istniejących organizacji); panel Super Admina „Plany i limity" (CRUD, każdy zapis przez `recordAudit` z aktorem SuperAdmin i from→to); helper egzekwowania: kolejność override → plan → **fail-closed**, live COUNT bez `FOR UPDATE` (decyzje #10–#12 spec §7), wpięty we WSZYSTKIE punkty z tabeli §2.20; feature gating §2.21 (UI „wymaga planu X" + backend); zmiana planu przez istniejący checkout/portal — webhook `customer.subscription.updated` mapuje `plan.stripe_price_id` → `organization.plan_id` (idempotencja jak w `webhooks.ts`); downgrade nie blokuje, blokuje tylko nowe operacje ponad limit; powiadomienia `plan_limit_approaching`/`plan_limit_reached` e-mail-only (retrofit F14). **Decyzja w tej fazie:** los `plans.ts` i tabeli cen na landing (langlion czyta plany z DB; boilerplate'owy pricing do przepięcia albo zamrożenia).
**DoD:** e2e: limit blokuje 26. ucznia przy max 25 i przestaje po podniesieniu limitu bez deploya; fail-closed przy braku wpisu; override per organizacja wygrywa z planem; webhook zmienia plan idempotentnie; audyt zmian konfiguracji; suita zielona.

---

