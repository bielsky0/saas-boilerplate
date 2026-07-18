--> HAND-EDITED (spec 6.4). Drizzle generated a single `ADD COLUMN "actorType"
--> text NOT NULL`, which aborts on a non-empty audit_log — and audit_log is
--> append-only, so on any deployed environment it is non-empty by definition.
--> Split into add-nullable / backfill / set-not-null.
--> 'Admin' is the correct backfill rather than a placeholder: every row that
--> predates this migration was written by the §6.3 panel, and those were all
--> super-admin actions. No Drizzle-level .default() accompanies this, so a future
--> call site that omits actorType fails loudly instead of silently defaulting.
ALTER TABLE "audit_log" ADD COLUMN "actorType" text;--> statement-breakpoint
UPDATE "audit_log" SET "actorType" = 'Admin' WHERE "actorType" IS NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "actorType" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organizationId","createdAt" DESC NULLS LAST);