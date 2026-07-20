--> HAND-WRITTEN (langlion US-1.1/AC1, §2.4, plan Faza 4).
-->
--> Two things Drizzle cannot express, in the shape 0015 and 0020 established:
--> Row-Level Security on the two credit tables, and the foreign key closing the
--> booking ↔ credit pair.
-->
--> INVISIBLE TO DRIZZLE, like 0014-0017 and 0020: neither policies nor this FK
--> have a TS representation, so `generate` will never propose dropping them and
--> `push` (banned repo-wide) would.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION 'role "saas_school" is missing — see docs/ARCHITECTURE.md "Two database URLs (RLS)"';
  END IF;
END $$;--> statement-breakpoint
--> THE OTHER HALF OF `booking.consumedCreditId`.
-->
--> Declared here rather than in `bookings.ts` because `credit` already points at
--> `booking` twice (sourceBookingId, usedInBookingId); declaring this side in
--> Drizzle would make the two schema modules import each other. An ES cycle in the
--> schema barrel is the exact failure that produced `class_session` — there it was
--> a shadowed export name, here it would be a cycle, and both are quiet.
-->
--> Composite, like every other cross-table key in this domain: the credit a
--> booking consumed must belong to the booking's own academy. ON DELETE restrict —
--> a consumed credit is a ledger entry, and the row that records what was spent
--> cannot outlive its own justification by being silently unlinked.
ALTER TABLE "booking" ADD CONSTRAINT "booking_consumed_credit_fk"
  FOREIGN KEY ("consumedCreditId", "organizationId")
  REFERENCES "public"."credit"("id", "organizationId")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
--> NO DATA GATE NEEDED BEFORE THESE FORCEs. Both tables are created empty by 0021
--> in this same migration run, so "rows without an owner" is a question that
--> cannot have a non-zero answer. The gate matters when a policy is added to a
--> table that ALREADY holds rows, where a zero read on the wrong side of the
--> switch is a zero with no content (F1a's lesson) — keep it in mind for F12,
--> which adds `credit_purchase` alongside credits that will exist by then.
ALTER TABLE "credit_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_type" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "credit_type_tenant_isolation" ON "credit_type"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "credit_type_system_bypass" ON "credit_type"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');--> statement-breakpoint
ALTER TABLE "credit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
--> ⚠️ THE EXPIRY SWEEP IS THE ONE READER THAT SPANS EVERY ACADEMY, and it is why
--> the bypass policy below is not decoration on this table. A cron sweep cannot
--> name a tenant: credits expire on their own clock in every organization at once.
--> `features/credits/expire.ts` therefore reads its work list under
--> withSystemBypass() and then re-enters each row's OWN tenant context to write —
--> the same narrow-bypass shape as `storage/purge.ts` (D19), so WITH CHECK stays
--> load-bearing exactly where a tenant mix-up would destroy value.
CREATE POLICY "credit_tenant_isolation" ON "credit"
  FOR ALL TO saas_school
  USING ("organizationId" = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('app.organization_id', true), ''));--> statement-breakpoint
CREATE POLICY "credit_system_bypass" ON "credit"
  FOR ALL TO saas_school
  USING (coalesce(current_setting('app.bypass_rls', true), '') = 'on')
  WITH CHECK (coalesce(current_setting('app.bypass_rls', true), '') = 'on');
