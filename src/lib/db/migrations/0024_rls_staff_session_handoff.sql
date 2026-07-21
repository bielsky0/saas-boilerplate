--> HAND-WRITTEN (langlion plan Faza 5.5, decyzja D74).
-->
--> Row-Level Security for staff_session_handoff, in the same shape as 0020: tenant
--> isolation on "organizationId", plus the fenced system-bypass policy
--> withSystemBypass() in src/lib/db/system.ts relies on.
-->
--> NOT INFRASTRUCTURE: a handoff token names a specific organization the
--> receiving user is entering, so it is a tenant record by the same test 0020
--> applies to client_otp/client_session — the subject is not a system credential,
--> and its access boundary is the tenant GUC, not CRON_SECRET/requireSuperAdmin().
-->
--> NO DATA GATE NEEDED BEFORE THESE FORCEs. The table is created empty by 0023 in
--> the immediately preceding migration, so "rows without an owner" cannot be a
--> non-zero answer here — same reasoning as 0020's note on client_otp/client_session.
-->
--> INVISIBLE TO DRIZZLE, like 0014-0020: policies have no TS representation, so
--> `generate` will never propose dropping them and `push` (banned repo-wide) would.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "staff_session_handoff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_session_handoff" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "staff_session_handoff_tenant_isolation" ON "staff_session_handoff"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "staff_session_handoff_system_bypass" ON "staff_session_handoff"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
