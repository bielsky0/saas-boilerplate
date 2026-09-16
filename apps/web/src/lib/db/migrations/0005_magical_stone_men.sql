CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dedupeKey" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 5 NOT NULL,
	"runAt" timestamp DEFAULT now() NOT NULL,
	"claimedAt" timestamp,
	"lastError" text,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_dedupe_key_uq" UNIQUE("dedupeKey")
);
--> statement-breakpoint
CREATE TABLE "email_suppression" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"category" text NOT NULL,
	"reason" text DEFAULT 'unsubscribe' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppression_email_category_uq" UNIQUE("email","category")
);
--> statement-breakpoint
CREATE INDEX "job_claim_idx" ON "job" USING btree ("status","runAt");--> statement-breakpoint
CREATE INDEX "job_name_created_idx" ON "job" USING btree ("name","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_suppression_email_idx" ON "email_suppression" USING btree ("email");