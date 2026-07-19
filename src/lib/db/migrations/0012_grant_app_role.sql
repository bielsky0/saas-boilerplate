--> HAND-WRITTEN (langlion Faza 0, decyzja D2 — two database URLs).
--> Grants the unprivileged runtime role the DML it needs. Until this runs, the
--> app cannot read a single row: migrations create tables as the owner
--> (DATABASE_MIGRATION_URL), and the role behind DATABASE_URL owns nothing.
-->
--> The role itself is NOT created here. CREATE ROLE is a cluster-level operation
--> that a migration running as a non-superuser cannot perform, and on managed
--> hosting roles are provisioned out of band. Locally it comes from
--> docker/postgres-init/01-app-role.sql; in CI from a psql step in ci.yml. If it
--> is missing we stop with a message that names the fix, rather than letting
--> every later GRANT fail with "role does not exist" one line at a time.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_school') THEN
    RAISE EXCEPTION
      'role "saas_school" is missing. Local: recreate the volume (docker compose down -v && pnpm db:up) so docker/postgres-init runs. CI: see the "Provision unprivileged application role" step. Docs: docs/ARCHITECTURE.md "Two database URLs (RLS)".';
  END IF;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO saas_school;--> statement-breakpoint
--> DML only, never DDL: the runtime role must not be able to drop a policy or a
--> constraint that is load-bearing for tenant isolation.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO saas_school;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO saas_school;--> statement-breakpoint
--> ALTER DEFAULT PRIVILEGES attaches to the role that RUNS it and applies only to
--> objects that role creates afterwards. So migrations must always run as the SAME
--> owner on every environment. If CI migrates as `postgres` but production migrates
--> as some other owner, tables added by later phases silently arrive without grants
--> and the app fails with "permission denied" only after deploy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saas_school;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO saas_school;
