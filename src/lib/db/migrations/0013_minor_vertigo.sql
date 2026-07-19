--> HAND-EDITED (langlion §1.2, §2.14, Constraint 5, decyzja D10).
-->
--> btree_gist first: the EXCLUDE constraints on `session` and `booking` in the
--> next migration (§5.1/§5.3) need its equality operator class alongside the
--> range overlap operator. It is NOT a trusted extension in PG16, so CREATE needs
--> superuser — one of the reasons DATABASE_MIGRATION_URL is a separate role.
--> IF NOT EXISTS makes this a no-op where a DBA already enabled it out of band
--> (managed hosting), rather than a failed deploy.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
--> Drizzle generated three bare `ADD COLUMN ... NOT NULL` statements, each of
--> which aborts on a non-empty `organization`. Split into add-nullable, backfill,
--> then constrain — the same three-step shape as 0011_sloppy_leopardon.sql.
-->
--> None of these three columns gets a database DEFAULT, on purpose. A default
--> currency would let an academy be created with a quietly wrong one, and currency
--> is effectively immutable once transactional data exists (Constraint 5,
--> US-24.1/AC1). Requiredness is enforced in the application at creation time
--> instead, where the operator can actually see the choice being made.
ALTER TABLE "organization" ADD COLUMN "subdomain" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "currency" text;--> statement-breakpoint
--> `subdomain` cannot be backfilled with a literal the way the other two are: it
--> carries a UNIQUE constraint, so a constant would collide on the second row.
--> `slug` is already globally unique and already slugified, which makes it the
--> only correct source — and it keeps existing dev/staging orgs addressable.
UPDATE "organization" SET "subdomain" = "slug" WHERE "subdomain" IS NULL;--> statement-breakpoint
UPDATE "organization" SET "timezone" = 'Europe/Warsaw' WHERE "timezone" IS NULL;--> statement-breakpoint
UPDATE "organization" SET "currency" = 'PLN' WHERE "currency" IS NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "subdomain" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "timezone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
--> UNIQUE last: it must see the backfilled values, not an all-NULL column.
ALTER TABLE "organization" ADD CONSTRAINT "organization_subdomain_unique" UNIQUE("subdomain");
