--> HAND-WRITTEN (langlion US-1.1/AC1, spec §1.3, plan Faza 0 pkt 4).
-->
--> Row-Level Security on the langlion domain tables. This is the SECOND line of
--> defence: `features/*/data.ts` still filters by "organizationId" explicitly,
--> because that filter is what uses the index and because AC1 is precisely about
--> what happens when someone forgets it. All access goes through withTenant()
--> in src/lib/db/tenant.ts, which sets app.organization_id for the transaction.
-->
--> WHY THIS FILE IS INVISIBLE TO DRIZZLE. Policies, like the EXCLUDE constraints
--> in 0014, have no representation in the TS schema and so are absent from
--> migrations/meta/*_snapshot.json. `drizzle-kit generate` diffs TS against that
--> snapshot and will never propose dropping them. `drizzle-kit push` introspects
--> the live database and WOULD; push is banned repo-wide (no db:push script).
-->
--> FORCE, not just ENABLE. ENABLE alone exempts the table OWNER, and the owner is
--> the migration role. FORCE closes that. Note the consequence for later phases:
--> a backfill inside a migration now runs subject to policy unless the migration
--> role has BYPASSRLS. It does (it is the superuser in dev/CI) — but if that ever
--> changes, a backfill will match zero rows and NOT error, because an UPDATE that
--> hits nothing is a success. That is the quiet failure to watch for in F1.--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
--> current_setting(..., true) passes missing_ok: an unset GUC yields NULL, the
--> comparison yields NULL, and the row is not visible — a clean deny. WITHOUT the
--> second argument the function RAISES instead, which turns every unscoped query
--> (and pg_dump, and some migrations) into an error that looks unrelated to RLS.
--> nullif(..., '') folds the empty string into that same NULL deny, so a caller
--> that sets the GUC to "" sees nothing rather than everything.
ALTER TABLE "location" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "location_tenant_isolation" ON "location"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
--> A second PERMISSIVE policy ORs with the first. Its only intended caller is
--> withSystemBypass() in src/lib/db/system.ts, which is fenced by
--> no-restricted-imports so new consumers arrive via a reviewed diff.
CREATE POLICY "location_system_bypass" ON "location"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "group_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_type" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_type_tenant_isolation" ON "group_type"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "group_type_system_bypass" ON "group_type"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "group_type_recurrence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_type_recurrence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "group_type_recurrence_tenant_isolation" ON "group_type_recurrence"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "group_type_recurrence_system_bypass" ON "group_type_recurrence"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "class_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_session_tenant_isolation" ON "class_session"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "class_session_system_bypass" ON "class_session"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "client_tenant_isolation" ON "client"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "client_system_bypass" ON "client"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "athlete" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "athlete" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "athlete_tenant_isolation" ON "athlete"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "athlete_system_bypass" ON "athlete"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "booking" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "booking_tenant_isolation" ON "booking"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "booking_system_bypass" ON "booking"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
