--> HAND-WRITTEN (langlion plan Faza 6, §2.33, EPIK 35).
-->
--> Row-Level Security for the three e-dziennik tables created in 0025
--> (grade_field, grade, progress_note), in the same shape as 0015/0020/0022/0024:
--> tenant isolation on "organizationId", plus the fenced system-bypass policy
--> withSystemBypass() in src/lib/db/system.ts relies on.
-->
--> NO DATA GATE NEEDED BEFORE THESE FORCEs. All three tables are created empty by
--> 0025 in the immediately preceding migration, so "rows without an owner" cannot
--> be a non-zero answer here — same reasoning as 0020/0022/0024's identical note.
-->
--> INVISIBLE TO DRIZZLE, like 0014-0024: policies have no TS representation, so
--> `generate` will never propose dropping them and `push` (banned repo-wide) would.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "grade_field" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grade_field" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "grade_field_tenant_isolation" ON "grade_field"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "grade_field_system_bypass" ON "grade_field"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "grade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grade" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "grade_tenant_isolation" ON "grade"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "grade_system_bypass" ON "grade"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "progress_note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress_note" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "progress_note_tenant_isolation" ON "progress_note"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "progress_note_system_bypass" ON "progress_note"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
