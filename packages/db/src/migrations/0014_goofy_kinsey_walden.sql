CREATE TABLE "calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text,
	"accountId" text,
	"createdByUserId" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"startsAt" timestamp with time zone NOT NULL,
	"endsAt" timestamp with time zone NOT NULL,
	"allDay" boolean DEFAULT false NOT NULL,
	"kind" text DEFAULT 'etc' NOT NULL,
	"location" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_owner_ck" CHECK (("calendar_event"."organizationId" IS NULL) <> ("calendar_event"."accountId" IS NULL)),
	CONSTRAINT "calendar_event_range_ck" CHECK ("calendar_event"."endsAt" > "calendar_event"."startsAt")
);
--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_accountId_personal_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."personal_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_createdByUserId_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_org_idx" ON "calendar_event" USING btree ("organizationId","startsAt");--> statement-breakpoint
CREATE INDEX "calendar_event_account_idx" ON "calendar_event" USING btree ("accountId","startsAt");