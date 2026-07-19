--> HAND-WRITTEN (langlion US-1.1/AC1, spec §1.3, plan Faza 1a).
-->
--> Row-Level Security on the BOILERPLATE's tenant tables, extending what 0015 did
--> for the langlion core. Same second-line-of-defence contract: features/*/data.ts
--> still filters by the owner explicitly, because that filter is what uses the
--> index and because AC1 is precisely about what happens when someone forgets it.
-->
--> WHY THIS FILE IS INVISIBLE TO DRIZZLE — unchanged from 0015: policies have no
--> representation in the TS schema and are absent from meta/*_snapshot.json.
--> `drizzle-kit generate` will never propose dropping them; `drizzle-kit push`
--> introspects the live database and WOULD. push is banned repo-wide.
-->
--> NO BACKFILL, and that is a checked fact rather than an assumption. Both XOR
--> CHECKs shipped INLINE with their CREATE TABLE (file_owner_ck in 0007,
--> notification_owner_ck in 0008), so no window existed in which either table
--> accepted an ownerless row; membership.organizationId and
--> invitation.organizationId have been NOT NULL since creation. This was verified
--> against dev data as the migration's precondition — all four counts zero, run as
--> the OWNER role and BEFORE this file applied. Both halves of that matter: the
--> app role would report zero after the fact regardless, because those are exactly
--> the rows these policies hide. Repeat that check before F1b's equivalent.
-->
--> NO NEW GRANTS: 0012 granted DML on ALL TABLES and set ALTER DEFAULT PRIVILEGES
--> for saas_school, which covers all four.
-->
--> DEPLOY ORDER IS LOAD-BEARING. This file is the switch. The application code
--> that opens withTenant/withOwner must already be serving 100% of traffic before
--> it runs: applied first, requireOrgAccess reads zero membership rows and every
--> authenticated page 403s, for every tenant, with no partial-degradation mode.
--> Rolling back is a FORWARD migration (DROP POLICY + DISABLE ROW LEVEL SECURITY),
--> never a code revert — reverting code under live policies is the same outage.
--> See docs/ARCHITECTURE.md "Row-Level Security" for the runbook.--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
--> ORG-OWNED TABLES (membership, invitation): identical in shape to 0015. The
--> predicate reads app.organization_id, which withTenant() sets.
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_tenant_isolation" ON "membership"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "membership_system_bypass" ON "membership"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invitation_tenant_isolation" ON "invitation"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "invitation_system_bypass" ON "invitation"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
--> XOR-OWNED TABLES (file, notification): a row belongs to an organization XOR a
--> personal account (spec §5.2/§21.3), so the policy needs two disjuncts reading
--> two GUCs. withOwner() sets both on every call, blanking the inactive one.
-->
--> Read the three-valued logic deliberately. For an org-owned row "accountId" IS
--> NULL, so the second disjunct is NULL: `true OR NULL` = true (allow),
--> `false OR NULL` = NULL (deny), `NULL OR NULL` = NULL (deny — the no-context
--> case, failing closed exactly like the single-branch policy in 0015). The XOR
--> CHECK guarantees at least one column is non-NULL, so no row is unreachable.
ALTER TABLE "file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "file" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "file_owner_isolation" ON "file"
  FOR ALL TO saas_school
  USING (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  );--> statement-breakpoint
CREATE POLICY "file_system_bypass" ON "file"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_owner_isolation" ON "notification"
  FOR ALL TO saas_school
  USING (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('app.organization_id', true), '')
    OR "accountId" = nullif(current_setting('app.account_id', true), '')
  );--> statement-breakpoint
CREATE POLICY "notification_system_bypass" ON "notification"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
