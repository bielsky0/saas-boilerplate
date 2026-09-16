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
  // Mirrors the web app's MULTI_TENANCY_MODE (spec 1.4) — same names, so one
  // `.env` shape serves both apps. Cosmetic-by-contract, like in web: it gates
  // what the API resolves, never the data model.
  MULTI_TENANCY_MODE: z.enum(["required", "optional", "disabled"]).default("required"),
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
