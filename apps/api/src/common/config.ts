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
  // Shared secret for the job-drain endpoint (spec 12) — guards
  // `GET /v1/cron/jobs` (faza 2.3: the drain lives in the API now, so this
  // secret guards the API endpoint; the web route forwards to it). Vercel Cron
  // attaches it as `Authorization: Bearer $CRON_SECRET`; a Docker sidecar or
  // external pinger sends the same header. Unset = no drain endpoint (404);
  // the queue still fills, retries just never run. Generate:
  // openssl rand -base64 32.
  CRON_SECRET: z.string().min(1).optional(),
  // Email delivery (spec 10.1) — faza 2.3 moves the drain into the API, so the
  // provider selection moves with it. Same names as web, so one `.env` shape
  // serves both apps. `log` renders + records into the in-process outbox the
  // E2E suite reads via `/v1/dev/emails`; `resend` sends real mail.
  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  // From header for outgoing mail. Only read by the resend adapter.
  EMAIL_FROM: z.string().default("SaaS Boilerplate <onboarding@example.com>"),
  // Only required when EMAIL_PROVIDER=resend; the adapter throws a clear
  // error at construction if selected without a key.
  RESEND_API_KEY: z.string().optional(),
  // Signs unsubscribe links (spec 10.3). Falls back to BETTER_AUTH_SECRET
  // when unset — see the rotation-constraint comment in web's
  // `src/lib/env/server.ts`. Generate: openssl rand -base64 32.
  EMAIL_UNSUBSCRIBE_SECRET: z.string().min(32).optional(),
  // Object-storage selection (spec 21.1). `none` = no bucket; the retention
  // purge then dead-letters exactly like web's `none` adapter throws today.
  // Full S3 wiring (vars + adapter) lands with the storage port in faza 2.4.
  STORAGE_PROVIDER: z.enum(["none", "s3"]).default("none"),
  // S3-compatible object store (spec 21.1) — faza 2.4 moves the adapter into
  // the API, so these move with it. Same names as web, so one `.env` shape
  // serves both apps. Only required when STORAGE_PROVIDER=s3; the adapter
  // throws a clear error at construction when selected without a bucket or
  // credentials. S3_ENDPOINT: custom endpoint for non-AWS S3 (MinIO
  // "http://localhost:9000", R2, B2); unset = real AWS S3 for the region.
  // S3_PUBLIC_URL: base for the STABLE public URL of public-visibility files;
  // unset = derived from endpoint+bucket (path-style).
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  S3_PUBLIC_URL: z.string().optional(),
  // Billing provider selection (spec 5.1) — faza 2.5 moves the money path
  // into the API, so these move with it. Same names as web, so one `.env`
  // shape serves both apps. Defaults to "none" so the boilerplate builds and
  // boots with zero payment configuration: the adapter factory must never
  // throw for the default (it runs at provider init, which would break boot
  // for everyone). "none" makes the webhook route answer 404.
  BILLING_PROVIDER: z.enum(["none", "stripe"]).default("none"),
  // Only required when BILLING_PROVIDER=stripe; the stripe adapter throws a
  // clear error at construction if it is selected without these.
  STRIPE_SECRET_KEY: z.string().optional(),
  // Webhook signing secret (spec 5.4). Verification is a local HMAC against
  // this value — no network call — so tests sign fixtures offline.
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  // Price IDs differ per environment (test vs live), so each paid plan gets
  // its own variable rather than a JSON blob. Unset = the plan is simply
  // unmapped in this environment (see `planIdForPriceId` in `@repo/billing`).
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
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
