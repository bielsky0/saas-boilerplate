--> HAND-WRITTEN (langlion US-1.1/AC1, spec §1.3, plan Faza 1b).
-->
--> Row-Level Security on the BILLING tables, closing the retrofit that 0015
--> (langlion core) and 0016 (boilerplate tenant tables) began. Same
--> second-line-of-defence contract: features/billing/data.ts still filters by the
--> owner explicitly, because that filter is what uses the index and because AC1 is
--> precisely about what happens when someone forgets it.
-->
--> ALL FOUR TABLES TAKE THE XOR SHAPE, including webhook_event. The marker is only
--> ever written AFTER the owner has been resolved, so it carries the owner columns
--> like every other business table and needs no carve-out.
-->
--> WHY THIS FILE IS INVISIBLE TO DRIZZLE — unchanged from 0015/0016: policies have
--> no representation in the TS schema and are absent from meta/*_snapshot.json.
--> `drizzle-kit generate` will never propose dropping them; `drizzle-kit push`
--> introspects the live database and WOULD. push is banned repo-wide.
-->
--> NO BACKFILL, checked rather than assumed. All four XOR CHECKs shipped INLINE
--> with their CREATE TABLE, so no window existed in which any of them accepted an
--> ownerless row. Verified as this migration's precondition, run as the OWNER role
--> and BEFORE this file applied (both halves matter — the app role reports zero
--> afterwards regardless, because those are exactly the rows these policies hide):
-->
-->   table             total  org_owned  account_owned  ownerless
-->   billing_customer     30         30              0          0
-->   subscription         14         14              0          0
-->   billing_payment       8          8              0          0
-->   webhook_event        26         26              0          0
-->
--> and all four *_owner_ck constraints present with convalidated = true, which is
--> what makes those zeroes proven rather than merely observed.
-->
--> A THIRD GATE QUERY, WITH NO F1a EQUIVALENT: every subscription and
--> billing_payment was checked to agree on its owner with the billing_customer it
--> points at (zero rows disagreeing). No constraint enforces that, and the reason
--> it matters is the ON CONFLICT semantics below.
-->
--> RLS AND `ON CONFLICT` — measured against this Postgres, not assumed, because
--> three guarantees in features/billing/webhooks.ts depend on it:
-->   * DO NOTHING evaluates the INSERT WITH CHECK ONLY ("regardless of whether or
-->     not they end up being inserted"). A conflicting row that is invisible under
-->     USING still yields no row and no error, so the idempotency marker's
-->     duplicate detection is completely unchanged.
-->   * setWhere is evaluated BEFORE the USING check. A stale event still returns
-->     zero rows without raising, so the watermark's `applied.length === 0` signal
-->     means exactly what it always did.
-->   * DO UPDATE against a row invisible under USING RAISES 42501 — "unlike a
-->     standalone UPDATE command, if the existing row does not pass the USING
-->     expressions, an error will be thrown (the UPDATE path will never be silently
-->     avoided)". So a FRESH event whose customer owner disagrees with the owner
-->     already stored on the row now fails loudly instead of silently overwriting
-->     another tenant's row (the upserts deliberately omit owner columns from their
-->     SET clause, so today the row would keep its owner and take the data). That
-->     trade is intended. Note the asymmetry: a STALE event with the same mismatch
-->     is swallowed as stale, so the error is not a reliable detector of the
-->     condition — the pre-migration gate above is.
-->
--> NO NEW GRANTS: 0012 granted DML on ALL TABLES and set ALTER DEFAULT PRIVILEGES
--> for saas_school, which covers all four.
-->
--> DEPLOY ORDER IS LOAD-BEARING. This file is the switch. The application code that
--> opens withOwner must already be serving 100% of traffic before it runs: applied
--> first, the webhook handler writes without a context and every provider event
--> 500s, and the billing panel renders an empty plan for every tenant. Rolling back
--> is a FORWARD migration (DROP POLICY + DISABLE ROW LEVEL SECURITY), never a code
--> revert — reverting code under live policies is the same outage.
--> See docs/ARCHITECTURE.md "Row-Level Security" for the runbook.--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
--> XOR-OWNED, all four. A row belongs to an organization XOR a personal account
--> (spec §5.2), so the policy needs two disjuncts reading two GUCs. withOwner()
--> sets both on every call, blanking the inactive one.
-->
--> The three-valued logic is the same as 0016's: for an org-owned row "accountId"
--> IS NULL, so the second disjunct is NULL — `true OR NULL` = true (allow),
--> `false OR NULL` = NULL (deny), `NULL OR NULL` = NULL (deny, the no-context case
--> failing closed). The XOR CHECK guarantees at least one column is non-NULL, so
--> no row is unreachable.
ALTER TABLE "billing_customer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_customer" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "billing_customer_owner_isolation" ON "billing_customer"
  FOR ALL TO saas_school
  USING (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  );--> statement-breakpoint
--> The bypass this one serves is narrower than it looks: findBillingCustomer in
--> features/billing/cross-tenant.ts, the single read that maps a provider customer
--> id to a tenant. Everything the webhook writes afterwards runs under withOwner.
CREATE POLICY "billing_customer_system_bypass" ON "billing_customer"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscription_owner_isolation" ON "subscription"
  FOR ALL TO saas_school
  USING (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  );--> statement-breakpoint
CREATE POLICY "subscription_system_bypass" ON "subscription"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "billing_payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_payment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "billing_payment_owner_isolation" ON "billing_payment"
  FOR ALL TO saas_school
  USING (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  );--> statement-breakpoint
CREATE POLICY "billing_payment_system_bypass" ON "billing_payment"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "webhook_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "webhook_event_owner_isolation" ON "webhook_event"
  FOR ALL TO saas_school
  USING (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  );--> statement-breakpoint
CREATE POLICY "webhook_event_system_bypass" ON "webhook_event"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
