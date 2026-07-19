-- Unprivileged application role for Row-Level Security (langlion Faza 0, decyzja D2).
--
-- WHY THIS FILE EXISTS: RLS is not enforced against a superuser, and it is not
-- enforced against a table's owner unless the table also has FORCE ROW LEVEL
-- SECURITY. Connecting the app as `postgres` — which is both — would leave every
-- policy in the schema decorative while looking perfectly configured. US-1.1/AC1
-- requires isolation to hold even when the application layer forgets its filter,
-- so the runtime role must be neither superuser nor owner.
--
-- The split is therefore: DATABASE_MIGRATION_URL connects as `postgres` (owns
-- the schema, runs DDL, has implicit BYPASSRLS for backfills), DATABASE_URL
-- connects as `saas_school` (owns nothing, subject to every policy).
--
-- WHEN THIS RUNS: the postgres image executes /docker-entrypoint-initdb.d/*.sql
-- ONLY when initialising an empty data directory. An existing volume from before
-- this file was added will NOT pick it up, and the RLS migration will fail fast
-- with a pointer to docs/ARCHITECTURE.md. The recovery one-liner is documented
-- there; `docker compose down -v` also works if the local data is disposable.
CREATE ROLE saas_school LOGIN PASSWORD 'saas_school' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE saas_boilerplate TO saas_school;

-- Required by the EXCLUDE constraints on `session` and `booking` (spec §5.1/§5.3):
-- a GiST exclusion over (uuid-ish text WITH =, tstzrange WITH &&) needs the
-- equality operator class that btree_gist provides. It is NOT a trusted extension
-- in PG16, so creating it needs superuser — one more reason the migration role is
-- separate. On managed hosting (Supabase/Neon/RDS) a DBA enables it out of band.
CREATE EXTENSION IF NOT EXISTS btree_gist;
