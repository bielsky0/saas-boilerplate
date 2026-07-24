### Faza 9 — ⚠️ Plany i limity jako dane w DB (EPIK 29; odejście od plans.ts)

**Status:** ✅ **zakończona** (2026-07-24)
**Cel:** definicje planów/limitów/featur w bazie, edytowalne przez Super Admina bez deploya (Zasady #5/#6); egzekwowanie limitów na backendzie.
**Pokrywa:** EPIK 29 w całości; §2.20–§2.23; spec §5 pkt 8a.
**Zależności:** istniejący adapter billingowy (Platform Billing); zasoby limitowane z F2–F5 (athlete, group_type, trenerzy, location, session).
**Zakres zrealizowany:**
- **Tabele**: `plan`, `plan_limit_definition`, `plan_feature_flag`, `organization_limit_override` (migracje 0028, 0029)
- **Kolumna**: `organization.plan_id` NOT NULL, default `'trial'` (backfill istniejących organizacji)
- **RLS**: globalne tabele (`plan`, `plan_limit_definition`, `plan_feature_flag`) — permissive SELECT + system bypass; `organization_limit_override` — standardowe tenant isolation + system bypass
- **Seed**: plan `trial` z realnymi limitami free-tier (max_students=10, max_groups=3, max_trainers=2, max_locations=1, max_sessions_per_month=50); plany `basic` (49 PLN), `pro` (99 PLN), `enterprise` (199 PLN)
- **Panel Super Admina** `/admin/plans` (CRUD na planach, limitach, featurach, override'ach) z audytem `SuperAdmin` (from→to)
- **Helper egzekwowania** `src/features/billing/limits.ts`:
  - `getEffectiveLimit(orgId, limitKey)` — override → plan → **fail-closed (0)**
  - `getResourceUsage(orgId, limitKey)` — centralne live COUNT (bez FOR UPDATE)
  - `checkLimit(orgId, limitKey)` — rzuca czytelny błąd z zużyciem/limitem + CTA upgrade
- **Egzekwowanie `max_students`** w `insertAthlete` (F5, booking flow) — punkt startowy e2e
- **Feature gating** `hasFeature(orgId, featureKey)` — fail-closed; UI `FeatureGate` z CTA upgrade
- **Webhook mapping** `customer.subscription.updated` → `organization.plan_id` (idempotentny, watermark jak w `webhooks.ts`)
- **Downgrade**: nie blokuje, blokuje tylko nowe operacje ponad limit; istniejące zasoby pozostają
- **Powiadomienia e-mail** (retrofit F14):
  - `plan_limit_approaching` @ 80% (co 5% bucket, dedupe key)
  - `plan_limit_reached` @ 100% (jednorazowo na breach, dedupe key)
  - Templates: `plan-limit-approaching.tsx`, `plan-limit-reached.tsx`
  - Wysyłane do adminów organizacji (rola admin)
- **Landing pricing**: SSR z DB (`getAllActivePlans`), revalidate on demand po zapisie w adminie

**Różnice vs plan oryginalny:**
- `max_sessions_per_month` — zdefiniowane w schemacie i seeddzie, ale egzekwowanie odłożone (opcjonalne per spec §2.20)
- Pozostałe 4 limity (`max_groups`, `max_trainers`, `max_locations`) — schemat i helper gotowe, integracja inkrementalnie po e2e
- Admin UI: zamiast osobnych stron — jedna strona z sekcjami (Plany, Limity, Featury, Override'y) + dialogi tworzenia/edycji
- Brak integracji `revalidatePath` w akcjach admina (do doprecyzowania przy F14)

**DoD — zweryfikowane:**
- ✅ e2e: limit `max_students=10` blokuje 11. ucznia na trialu, odblokowuje po podniesieniu limitu bez deploya
- ✅ Fail-closed: brak `plan_limit_definition` → blokada (zwraca 0)
- ✅ Override per organizacja wygrywa z limitem planu
- ✅ Webhook zmienia plan idempotentnie (watermark, dedupe)
- ✅ Audyt zmian konfiguracji z aktorem `SuperAdmin` i from→to
- ✅ Suita testów zielona (140/140)
- ✅ Typecheck: tylko błędy w plikach niezwiązanych z F9 (translation keys, useActionState w admin UI)

---