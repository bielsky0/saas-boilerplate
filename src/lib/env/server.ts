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
    // Signing secret for Better Auth sessions/tokens (spec 2.5). Required — CI
    // provides a dummy value in its env block, mirroring DATABASE_URL, so build
    // stays honest without weakening validation. Generate: openssl rand -base64 32.
    BETTER_AUTH_SECRET: z.string().min(1),
    // Base URL Better Auth uses to build verification links and cookies.
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    // Selects the email adapter implementation (spec 10.1). "log" prints the
    // message (incl. verification link) to the server console + an in-memory
    // outbox for dev/CI; "resend" sends real mail.
    EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
    // From header for outgoing transactional mail.
    EMAIL_FROM: z.string().default("SaaS Boilerplate <onboarding@example.com>"),
    // Only required when EMAIL_PROVIDER=resend; the resend adapter throws a
    // clear error at construction if it is selected without a key.
    RESEND_API_KEY: z.string().optional(),
  },
  // Server vars are read straight from process.env in the Node runtime.
  experimental__runtimeEnv: {},
  // Treat empty strings as "missing" rather than valid empty values.
  emptyStringAsUndefined: true,
  // Escape hatch for CI/tooling that only needs types, not a real env.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
