import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration (spec 11.1 — versioned, reproducible migrations).
 *
 * `dotenv/config` loads `.env` so the CLI (`pnpm db:generate` / `db:migrate` /
 * `db:studio`) can read DATABASE_URL. Schema is split across
 * `src/schema/*`; generated SQL migrations live in `src/migrations`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
