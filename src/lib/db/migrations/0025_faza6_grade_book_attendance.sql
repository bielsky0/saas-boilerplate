--> GENERATED (langlion plan Faza 6, §2.29/EPIK 31 v15 + §2.33/EPIK 35 v16).
-->
--> No conflict with `booking_athlete_no_overlap_excl` (§5.3): that EXCLUDE's
--> predicate filters on "paymentStatus" (`NOT IN ('cancelled')`), not on the
--> three new "attendance*" columns added to "booking" below, so this migration
--> does not change the set of rows the exclusion covers and requires no index
--> rebuild (verified against `0014_lively_sumo.sql`).
-->
--> "grade_field_session_fk" is ON DELETE CASCADE by design (langlion decision):
--> deleting a `class_session` cascades to any ad-hoc `grade_field` defined on it,
--> which in turn cascades to its `grade` rows via "grade_grade_field_fk". This is
--> mostly a theoretical path today — sessions with bookings cannot be deleted at
--> all, since `booking_class_session_fk` (bookings.ts) is ON DELETE RESTRICT —
--> but the FK is still declared CASCADE rather than SET NULL/RESTRICT for
--> consistency with that decision, not conditioned on whether the path is
--> reachable yet.
CREATE TABLE "grade_field" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"groupTypeId" text,
	"sessionId" text,
	"name" text NOT NULL,
	"fieldType" text NOT NULL,
	"minValue" integer,
	"maxValue" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grade_field_id_org_uq" UNIQUE("id","organizationId"),
	CONSTRAINT "grade_field_owner_ck" CHECK (("grade_field"."groupTypeId" IS NULL) <> ("grade_field"."sessionId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "grade" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"gradeFieldId" text NOT NULL,
	"bookingId" text NOT NULL,
	"value" text NOT NULL,
	"enteredByUserId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grade_id_org_uq" UNIQUE("id","organizationId"),
	CONSTRAINT "grade_field_booking_uq" UNIQUE("gradeFieldId","bookingId")
);
--> statement-breakpoint
CREATE TABLE "progress_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"bookingId" text NOT NULL,
	"content" text NOT NULL,
	"enteredByUserId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "attendanceStatus" text DEFAULT 'unmarked' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "attendanceMarkedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "attendanceMarkedByUserId" text;--> statement-breakpoint
ALTER TABLE "grade_field" ADD CONSTRAINT "grade_field_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_field" ADD CONSTRAINT "grade_field_group_type_fk" FOREIGN KEY ("groupTypeId","organizationId") REFERENCES "public"."group_type"("id","organizationId") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_field" ADD CONSTRAINT "grade_field_session_fk" FOREIGN KEY ("sessionId","organizationId") REFERENCES "public"."class_session"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_enteredByUserId_user_id_fk" FOREIGN KEY ("enteredByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_grade_field_fk" FOREIGN KEY ("gradeFieldId","organizationId") REFERENCES "public"."grade_field"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_booking_fk" FOREIGN KEY ("bookingId","organizationId") REFERENCES "public"."booking"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_note" ADD CONSTRAINT "progress_note_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_note" ADD CONSTRAINT "progress_note_enteredByUserId_user_id_fk" FOREIGN KEY ("enteredByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_note" ADD CONSTRAINT "progress_note_booking_fk" FOREIGN KEY ("bookingId","organizationId") REFERENCES "public"."booking"("id","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grade_field_org_idx" ON "grade_field" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "grade_field_group_type_idx" ON "grade_field" USING btree ("groupTypeId");--> statement-breakpoint
CREATE INDEX "grade_field_session_idx" ON "grade_field" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "grade_org_idx" ON "grade" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "grade_grade_field_idx" ON "grade" USING btree ("gradeFieldId");--> statement-breakpoint
CREATE INDEX "grade_booking_idx" ON "grade" USING btree ("bookingId");--> statement-breakpoint
CREATE INDEX "progress_note_org_idx" ON "progress_note" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "progress_note_booking_idx" ON "progress_note" USING btree ("bookingId");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_attendanceMarkedByUserId_user_id_fk" FOREIGN KEY ("attendanceMarkedByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;