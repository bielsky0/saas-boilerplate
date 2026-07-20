CREATE TABLE "client_otp" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"clientId" text NOT NULL,
	"email" text NOT NULL,
	"codeHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_otp_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
CREATE TABLE "client_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"clientId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"lastUsedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_session_tokenHash_unique" UNIQUE("tokenHash"),
	CONSTRAINT "client_session_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
ALTER TABLE "client_otp" ADD CONSTRAINT "client_otp_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_otp" ADD CONSTRAINT "client_otp_client_fk" FOREIGN KEY ("clientId","organizationId") REFERENCES "public"."client"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_session" ADD CONSTRAINT "client_session_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_session" ADD CONSTRAINT "client_session_client_fk" FOREIGN KEY ("clientId","organizationId") REFERENCES "public"."client"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_otp_org_idx" ON "client_otp" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "client_otp_lookup_idx" ON "client_otp" USING btree ("organizationId","email");--> statement-breakpoint
CREATE INDEX "client_session_org_idx" ON "client_session" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "client_session_client_idx" ON "client_session" USING btree ("clientId");