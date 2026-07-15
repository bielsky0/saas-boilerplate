import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Server-side environment schema (spec 19.1 — fail-fast configuration).
 *
 * This is the single source of truth for server-only environment variables.
 * `createEnv` parses `process.env` against the schema the moment this module is
 * imported, so a missing or malformed variable throws immediately with a clear,
 * per-variable error. It is imported from `next.config.ts`, which makes both
 * `next dev` and `next build` refuse to start when configuration is invalid.
 *
 * Add new server variables here (never read `process.env` directly elsewhere).
 * Public, browser-exposed variables belong in `./client.ts`.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Postgres connection string used by the Drizzle client (spec 11).
    DATABASE_URL: z.url(),
  },
  // Server vars are read straight from process.env in the Node runtime.
  experimental__runtimeEnv: {},
  // Treat empty strings as "missing" rather than valid empty values.
  emptyStringAsUndefined: true,
  // Escape hatch for CI/tooling that only needs types, not a real env.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
