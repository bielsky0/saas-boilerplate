import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration (spec 11.1 — versioned, reproducible migrations).
 *
 * `dotenv/config` loads `.env` so the CLI (`pnpm db:generate` / `db:migrate` /
 * `db:studio`) can read the connection string. Schema is split across
 * `src/lib/db/schema/*`; generated SQL migrations live in `src/lib/db/migrations`.
 *
 * Migrations connect as DATABASE_MIGRATION_URL, NOT DATABASE_URL (langlion Faza 0,
 * decyzja D2). The two are different roles on purpose: DATABASE_URL is the
 * unprivileged runtime role that Row-Level Security actually applies to, and it
 * owns nothing and cannot run DDL. See docs/ARCHITECTURE.md "Two database URLs".
 *
 * Reading `process.env` directly here is correct despite spec 19.1: this file is
 * CLI configuration, not application code, and it must stay outside the t3-env
 * schema so the running app can never read the owner's credentials.
 */
const url = process.env.DATABASE_MIGRATION_URL;

// Fail loudly rather than falling back to DATABASE_URL. A silent fallback would
// run DDL as the unprivileged role and surface as "permission denied for schema
// public" — an error that says nothing about the actual misconfiguration.
if (!url) {
  throw new Error(
    "DATABASE_MIGRATION_URL is required. Migrations run as the schema OWNER; " +
      "DATABASE_URL is the unprivileged, RLS-subject application role and cannot " +
      "run DDL. See docs/ARCHITECTURE.md “Two database URLs (RLS)”.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
