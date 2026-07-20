--> HAND-WRITTEN (langlion US-1.1/AC1, plan Faza 3).
-->
--> Row-Level Security for the two client-authentication tables, in the same shape
--> as 0015: tenant isolation on "organizationId", plus the fenced system-bypass
--> policy withSystemBypass() in src/lib/db/system.ts relies on.
-->
--> WHY THESE TWO TABLES ARE NOT INFRASTRUCTURE, despite looking like it. The
--> index.ts rule for an exempt table is that BOTH halves hold: the subject is not
--> a tenant record, AND the access boundary is a system credential. Neither holds
--> here. A login code and a session belong to a "client", which is unique per
--> (organizationId, email) and is a tenant record by definition — the same address
--> at two academies is two unrelated people. `rate_limit` is the instructive
--> contrast: its subject is an IP, which maps to no tenant and to many at once.
-->
--> INVISIBLE TO DRIZZLE, like 0014-0017: policies have no TS representation, so
--> `generate` will never propose dropping them and `push` (banned repo-wide) would.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
--> NO DATA GATE NEEDED BEFORE THESE FORCEs, unlike the F1a retrofit. Both tables
--> are created empty by 0019 in this same migration run, so "rows without an
--> owner" is not a question that can have a non-zero answer. The gate matters when
--> a policy is added to a table that already holds rows; keep it in mind for any
--> future retrofit, where a zero read on the wrong side of the switch is a zero
--> with no content.
ALTER TABLE "client_otp" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_otp" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "client_otp_tenant_isolation" ON "client_otp"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "client_otp_system_bypass" ON "client_otp"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "client_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_session" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
--> ⚠️ THE SESSION LOOKUP IS TENANT-SCOPED, WHICH IS A DESIGN CHOICE, NOT A
--> LIMITATION. A cookie resolves to a session only inside the academy currently
--> being served, so `resolveClientSession` enters withTenant() with the org it is
--> serving and a cookie from another academy simply finds no row. That is the
--> isolation §2.19 asks for, and it holds today on a shared host — before the
--> subdomain middleware exists to scope the cookie itself (F5).
CREATE POLICY "client_session_tenant_isolation" ON "client_session"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "client_session_system_bypass" ON "client_session"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
