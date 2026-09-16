CREATE TABLE "billing_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"providerCustomerId" text NOT NULL,
	"organizationId" text,
	"accountId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customer_provider_customer_uq" UNIQUE("provider","providerCustomerId"),
	CONSTRAINT "billing_customer_owner_ck" CHECK (("billing_customer"."organizationId" IS NULL) <> ("billing_customer"."accountId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"providerSubscriptionId" text NOT NULL,
	"billingCustomerId" text NOT NULL,
	"organizationId" text,
	"accountId" text,
	"providerPriceId" text NOT NULL,
	"planId" text,
	"status" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"currentPeriodEnd" timestamp,
	"lastEventAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_provider_subscription_uq" UNIQUE("provider","providerSubscriptionId"),
	CONSTRAINT "subscription_owner_ck" CHECK (("subscription"."organizationId" IS NULL) <> ("subscription"."accountId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "billing_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"providerPaymentId" text NOT NULL,
	"billingCustomerId" text NOT NULL,
	"organizationId" text,
	"accountId" text,
	"providerSubscriptionId" text,
	"status" text NOT NULL,
	"reason" text,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"lastEventAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payment_provider_payment_uq" UNIQUE("provider","providerPaymentId"),
	CONSTRAINT "billing_payment_owner_ck" CHECK (("billing_payment"."organizationId" IS NULL) <> ("billing_payment"."accountId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"providerEventId" text NOT NULL,
	"type" text NOT NULL,
	"organizationId" text,
	"accountId" text,
	"occurredAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_event_provider_event_uq" UNIQUE("provider","providerEventId"),
	CONSTRAINT "webhook_event_owner_ck" CHECK (("webhook_event"."organizationId" IS NULL) <> ("webhook_event"."accountId" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "billing_customer" ADD CONSTRAINT "billing_customer_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customer" ADD CONSTRAINT "billing_customer_accountId_personal_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."personal_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_billingCustomerId_billing_customer_id_fk" FOREIGN KEY ("billingCustomerId") REFERENCES "public"."billing_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_accountId_personal_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."personal_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_billingCustomerId_billing_customer_id_fk" FOREIGN KEY ("billingCustomerId") REFERENCES "public"."billing_customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment" ADD CONSTRAINT "billing_payment_accountId_personal_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."personal_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_accountId_personal_account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."personal_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_customer_org_idx" ON "billing_customer" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "billing_customer_account_idx" ON "billing_customer" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "subscription_org_idx" ON "subscription" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "subscription_account_idx" ON "subscription" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "billing_payment_org_idx" ON "billing_payment" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "billing_payment_account_idx" ON "billing_payment" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "webhook_event_org_idx" ON "webhook_event" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "webhook_event_account_idx" ON "webhook_event" USING btree ("accountId");