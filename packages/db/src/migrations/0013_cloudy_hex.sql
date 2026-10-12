CREATE TABLE "user_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"userLowId" text NOT NULL,
	"userHighId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_connection_pair_uq" UNIQUE("userLowId","userHighId"),
	CONSTRAINT "user_connection_order_ck" CHECK ("user_connection"."userLowId" < "user_connection"."userHighId"),
	CONSTRAINT "user_connection_distinct_ck" CHECK ("user_connection"."userLowId" <> "user_connection"."userHighId")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_connection" ADD CONSTRAINT "user_connection_userLowId_user_id_fk" FOREIGN KEY ("userLowId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connection" ADD CONSTRAINT "user_connection_userHighId_user_id_fk" FOREIGN KEY ("userHighId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_connection_low_idx" ON "user_connection" USING btree ("userLowId");--> statement-breakpoint
CREATE INDEX "user_connection_high_idx" ON "user_connection" USING btree ("userHighId");