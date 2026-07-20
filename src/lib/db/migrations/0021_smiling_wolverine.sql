CREATE TABLE "credit_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"name" text NOT NULL,
	"groupTypeId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "credit_type_id_org_uq" UNIQUE("id","organizationId"),
	CONSTRAINT "credit_type_group_type_uq" UNIQUE("groupTypeId")
);
--> statement-breakpoint
CREATE TABLE "credit" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"clientId" text NOT NULL,
	"creditTypeId" text NOT NULL,
	"athleteId" text,
	"validUntil" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"source" text NOT NULL,
	"sourceBookingId" text,
	"grantedByUserId" text,
	"reason" text,
	"creditPurchaseId" text,
	"usedInBookingId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
ALTER TABLE "credit_type" ADD CONSTRAINT "credit_type_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_type" ADD CONSTRAINT "credit_type_group_type_fk" FOREIGN KEY ("groupTypeId","organizationId") REFERENCES "public"."group_type"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_grantedByUserId_user_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_client_fk" FOREIGN KEY ("clientId","organizationId") REFERENCES "public"."client"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_credit_type_fk" FOREIGN KEY ("creditTypeId","organizationId") REFERENCES "public"."credit_type"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_athlete_fk" FOREIGN KEY ("athleteId","organizationId") REFERENCES "public"."athlete"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_source_booking_fk" FOREIGN KEY ("sourceBookingId","organizationId") REFERENCES "public"."booking"("id","organizationId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_used_in_booking_fk" FOREIGN KEY ("usedInBookingId","organizationId") REFERENCES "public"."booking"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_type_org_idx" ON "credit_type" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "credit_org_idx" ON "credit" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "credit_fifo_idx" ON "credit" USING btree ("organizationId","clientId","creditTypeId","status","validUntil");--> statement-breakpoint
CREATE INDEX "credit_expiry_idx" ON "credit" USING btree ("status","validUntil");