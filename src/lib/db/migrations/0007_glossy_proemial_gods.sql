CREATE TABLE "file" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text,
	"accountId" text,
	"uploadedByUserId" text,
	"key" text NOT NULL,
	"originalName" text NOT NULL,
	"contentType" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"entityType" text,
	"entityId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "file_key_uq" UNIQUE("key"),
	CONSTRAINT "file_owner_ck" CHECK (("file"."organizationId" IS NULL) <> ("file"."accountId" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_accountId_personal_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."personal_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_uploadedByUserId_user_id_fk" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_org_idx" ON "file" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "file_account_idx" ON "file" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "file_entity_idx" ON "file" USING btree ("entityType","entityId");