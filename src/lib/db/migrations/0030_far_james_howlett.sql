ALTER TABLE "organization" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "stripe_connect_account_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "stripe_connect_status" text DEFAULT 'not_connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "stripe_connect_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "stripe_connect_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "stripe_connect_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "platform_stripe_customer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_stripe_connect_account_uq" ON "organization" USING btree ("stripe_connect_account_id");