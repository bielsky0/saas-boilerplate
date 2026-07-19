CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "location_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
CREATE TABLE "group_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"engine" text NOT NULL,
	"paymentPolicy" text NOT NULL,
	"price" integer NOT NULL,
	"isNewClientOnly" boolean DEFAULT false NOT NULL,
	"eligibleTrainerIds" text[],
	"defaultLocationId" text,
	"allowedPurchaseModes" text[] NOT NULL,
	"allowedBillingTypes" text[],
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "group_type_id_org_uq" UNIQUE("id","organizationId"),
	CONSTRAINT "group_type_org_slug_uq" UNIQUE("organizationId","slug")
);
--> statement-breakpoint
CREATE TABLE "group_type_recurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"groupTypeId" text NOT NULL,
	"dayOfWeek" integer NOT NULL,
	"startTime" text NOT NULL,
	"durationMinutes" integer NOT NULL,
	"trainerId" text,
	"capacity" integer NOT NULL,
	"locationId" text,
	"isRecurring" boolean DEFAULT false NOT NULL,
	"occurrencesCount" integer,
	"startDate" date NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "gtr_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
CREATE TABLE "class_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"groupTypeId" text NOT NULL,
	"trainerId" text,
	"startTime" timestamp with time zone NOT NULL,
	"endTime" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"locationId" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"generatedFromRecurrenceId" text,
	"isManuallyAdjusted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_session_id_org_uq" UNIQUE("id","organizationId"),
	CONSTRAINT "class_session_recurrence_start_uq" UNIQUE("generatedFromRecurrenceId","startTime"),
	CONSTRAINT "class_session_id_org_time_uq" UNIQUE("id","organizationId","startTime","endTime")
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text,
	"isVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "client_id_org_uq" UNIQUE("id","organizationId"),
	CONSTRAINT "client_org_email_uq" UNIQUE("organizationId","email")
);
--> statement-breakpoint
CREATE TABLE "athlete" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"parentClientId" text NOT NULL,
	"name" text NOT NULL,
	"age" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "athlete_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"sessionId" text NOT NULL,
	"athleteId" text NOT NULL,
	"paymentStatus" text NOT NULL,
	"priceSnapshot" jsonb NOT NULL,
	"consumedCreditId" text,
	"sessionStartTime" timestamp with time zone NOT NULL,
	"sessionEndTime" timestamp with time zone NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_id_org_uq" UNIQUE("id","organizationId")
);
--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type" ADD CONSTRAINT "group_type_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type" ADD CONSTRAINT "group_type_default_location_fk" FOREIGN KEY ("defaultLocationId","organizationId") REFERENCES "public"."location"("id","organizationId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type_recurrence" ADD CONSTRAINT "group_type_recurrence_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type_recurrence" ADD CONSTRAINT "group_type_recurrence_trainerId_user_id_fk" FOREIGN KEY ("trainerId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type_recurrence" ADD CONSTRAINT "gtr_group_type_fk" FOREIGN KEY ("groupTypeId","organizationId") REFERENCES "public"."group_type"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type_recurrence" ADD CONSTRAINT "gtr_location_fk" FOREIGN KEY ("locationId","organizationId") REFERENCES "public"."location"("id","organizationId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_trainerId_user_id_fk" FOREIGN KEY ("trainerId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_group_type_fk" FOREIGN KEY ("groupTypeId","organizationId") REFERENCES "public"."group_type"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_recurrence_fk" FOREIGN KEY ("generatedFromRecurrenceId","organizationId") REFERENCES "public"."group_type_recurrence"("id","organizationId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_location_fk" FOREIGN KEY ("locationId","organizationId") REFERENCES "public"."location"("id","organizationId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_parent_client_fk" FOREIGN KEY ("parentClientId","organizationId") REFERENCES "public"."client"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_class_session_fk" FOREIGN KEY ("sessionId","organizationId","sessionStartTime","sessionEndTime") REFERENCES "public"."class_session"("id","organizationId","startTime","endTime") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_athlete_fk" FOREIGN KEY ("athleteId","organizationId") REFERENCES "public"."athlete"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_org_idx" ON "location" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "group_type_org_idx" ON "group_type" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "gtr_org_idx" ON "group_type_recurrence" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "gtr_group_type_idx" ON "group_type_recurrence" USING btree ("groupTypeId");--> statement-breakpoint
CREATE INDEX "class_session_org_start_idx" ON "class_session" USING btree ("organizationId","startTime");--> statement-breakpoint
CREATE INDEX "class_session_group_type_idx" ON "class_session" USING btree ("groupTypeId");--> statement-breakpoint
CREATE INDEX "client_org_idx" ON "client" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "athlete_org_idx" ON "athlete" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "athlete_parent_idx" ON "athlete" USING btree ("parentClientId");--> statement-breakpoint
CREATE INDEX "booking_org_idx" ON "booking" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "booking_session_idx" ON "booking" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "booking_athlete_idx" ON "booking" USING btree ("athleteId");--> statement-breakpoint
--> HAND-EDITED (langlion §5.1, §5.3, §1.3 Constraint 1/2, decyzja D5).
--> Drizzle has no representation for EXCLUDE, so these two constraints are
--> appended by hand and are INVISIBLE to migrations/meta/*_snapshot.json. Three
--> consequences, in order of how likely they are to bite:
-->   1. `drizzle-kit generate` diffs TS against the snapshot, never against the
-->      live database, so it will never propose dropping them. Safe.
-->   2. `drizzle-kit push` DOES introspect the database and WOULD propose their
-->      DROP. `push` is banned repo-wide: no db:push script, and ARCHITECTURE.md
-->      says so.
-->   3. A future migration altering the TYPE of any participating column will
-->      either fail or drop the constraint by cascade. The columns are listed by
-->      name in the headers of class-sessions.ts and bookings.ts.
-->
--> The '[)' bounds are load-bearing. With the default '[]' both endpoints are
--> inclusive, so back-to-back classes (17:00-18:00 and 18:00-19:00) would collide
--> and a normal timetable could not be built at all. With '()' a one-minute
--> genuine overlap would slip through.
-->
--> The quoting is load-bearing too: this repo's columns are camelCase, and an
--> unquoted "startTime" would be folded to lowercase and simply not found.
-->
--> §5.1 (trainer double-booking). The WHERE clause is a DELIBERATE addition to the
--> spec's wording (decyzja D5): without it a cancelled session keeps holding its
--> trainer's slot forever, which would only surface in F7 when admins start
--> cancelling sessions (US-19.2) and could not be fixed without a data migration.
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_trainer_no_overlap_excl"
  EXCLUDE USING gist (
    "trainerId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  ) WHERE ("status" <> 'cancelled');--> statement-breakpoint
--> §5.3 (same athlete in two overlapping sessions), verbatim from the spec:
--> "active" means payment_status NOT IN ('cancelled'), so a `no_show` still holds
--> the athlete's slot. That is intentional, not an oversight — the child was
--> booked and the seat was consumed.
ALTER TABLE "booking" ADD CONSTRAINT "booking_athlete_no_overlap_excl"
  EXCLUDE USING gist (
    "athleteId" WITH =,
    tstzrange("sessionStartTime", "sessionEndTime", '[)') WITH &&
  ) WHERE ("paymentStatus" NOT IN ('cancelled'));
