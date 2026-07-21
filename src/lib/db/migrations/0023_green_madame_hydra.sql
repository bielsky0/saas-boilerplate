CREATE TABLE "staff_session_handoff" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_session_handoff_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "staff_session_handoff" ADD CONSTRAINT "staff_session_handoff_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_session_handoff" ADD CONSTRAINT "staff_session_handoff_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_session_handoff_org_idx" ON "staff_session_handoff" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "staff_session_handoff_user_idx" ON "staff_session_handoff" USING btree ("userId");