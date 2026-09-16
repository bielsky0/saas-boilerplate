import { z } from "zod";

/**
 * API environment schema — fail-fast configuration, same contract as the
 * web app's `src/lib/env/server.ts` (spec 19.1).
 *
 * Parsed ONCE at bootstrap; a missing/invalid variable aborts startup with a
 * per-variable error instead of failing later at runtime. Each feature module
 * adds its own variables here as it is ported (Stripe, S3, mail, …) — with
 * the same names the web app uses, so one `.env` shape serves both apps.
 */
const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  // The engine's own origin (faza 2.1): emailed verification/reset links are
  // built from it, so they hit Nest directly ("wprost w Nest").
  BETTER_AUTH_URL: z.url().default("http://localhost:3001"),
  // The WEB app's public origin (faza 2.1): post-verification redirects land
  // there, CORS allows it, and the engine trusts it for callback URLs.
  // Same name as in web so one `.env` shape serves both apps.
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  // Mirrors the web app's MULTI_TENANCY_MODE (spec 1.4) — same names, so one
  // `.env` shape serves both apps. Cosmetic-by-contract, like in web: it gates
  // what the API resolves, never the data model.
  MULTI_TENANCY_MODE: z.enum(["required", "optional", "disabled"]).default("required"),
  // Login rate limiting (spec 2.1) — the same policy the web sign-in used.
  // Numbers are env (operator-tuned §2.1 policy); the general tiers stay code
  // in the rate-limit module, exactly like in web.
  RATE_LIMIT_MODE: z.enum(["enforce", "report-only", "off"]).default("enforce"),
  RATE_LIMIT_PROVIDER: z.enum(["memory", "postgres"]).default("memory"),
  RATE_LIMIT_FORWARDED_DEPTH: z.coerce.number().int().min(0).default(1),
  RATE_LIMIT_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_S: z.coerce.number().int().positive().default(900),
  // Shared secret for the web job-drain endpoint (spec 12). The auth module
  // fire-and-forget kicks it after every enqueue so verification/reset mail
  // keeps the immediacy web's `after()` kick gave it (faza 2.3 owns the general
  // solution). Unset = no kick; the queue still drains via cron. Generate:
  // openssl rand -base64 32.
  CRON_SECRET: z.string().min(1).optional(),
});

export type ApiConfig = z.infer<typeof ApiEnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = ApiEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid API environment variables:\n${issues.join("\n")}`);
  }
  return parsed.data;
}
