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
    // Structured logging (spec 15.3). Two renderers over ONE call site, for the
    // same reason EMAIL_PROVIDER defaults to "log": dev-readable, prod-real.
    // "pretty" reproduces the `[namespace] message key=value` line a human reads
    // in `pnpm dev` and in E2E output; "json" emits one object per line for a
    // collector to index. Neither is a different call site, so a log line cannot
    // drift between the two.
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
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
    // Signs unsubscribe links (spec 10.3). Falls back to BETTER_AUTH_SECRET when
    // unset, so the boilerplate needs zero extra config. Set it explicitly if you
    // ever intend to rotate BETTER_AUTH_SECRET: whichever secret signs these links
    // inherits a "never rotate without a compat window" constraint, because an
    // unsubscribe link must keep working forever (RFC 8058) — including from a
    // three-year-old mail archive. This variable exists so that constraint does not
    // have to land on the session secret. Generate: openssl rand -base64 32.
    EMAIL_UNSUBSCRIBE_SECRET: z.string().min(32).optional(),
    // Selects the background-jobs adapter implementation (spec 12). One member
    // today: this is the seam, not a fake choice. The postgres adapter closes over
    // `db` and cannot throw at construction, so the "default provider must never
    // throw at module load" rule holds trivially (same reason EMAIL_PROVIDER
    // defaults to "log").
    JOBS_PROVIDER: z.enum(["postgres"]).default("postgres"),
    // Shared secret for the job-drain endpoint (spec 12). Vercel Cron attaches it
    // automatically as `Authorization: Bearer $CRON_SECRET`; a Docker/systemd curl
    // or any external pinger sends the same header, so ONE mechanism serves both
    // deploy targets (§19.1) — unlike x-vercel-signature, which would make a
    // critical path Vercel-only. Unset = the route answers 404, exactly as
    // BILLING_PROVIDER=none makes the webhook route answer 404.
    //
    // A production deployment MUST set it. Without it `after()` still delivers the
    // happy path, so everything LOOKS fine — but retries and all scheduled work
    // (the onboarding sequence, pruning) silently never run.
    // Generate: openssl rand -base64 32.
    CRON_SECRET: z.string().min(32).optional(),
    // Selects the billing adapter implementation (spec 5.1). Defaults to "none"
    // so the boilerplate builds and runs with zero payment configuration: the
    // adapter factory runs at module load, so a default that could throw would
    // break `next build` for everyone (same reason EMAIL_PROVIDER defaults to
    // "log"). "none" makes the webhook route answer 404.
    BILLING_PROVIDER: z.enum(["none", "stripe"]).default("none"),
    // Only required when BILLING_PROVIDER=stripe; the stripe adapter throws a
    // clear error at construction if it is selected without these.
    STRIPE_SECRET_KEY: z.string().optional(),
    // Webhook signing secret (spec 5.4). Verification is a local HMAC against
    // this value — no network call — so tests can sign fixtures offline.
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    // Price IDs differ per environment (test vs live), so each paid plan gets
    // its own variable rather than a JSON blob: a missing one then fails with a
    // per-variable error, which is the point of fail-fast (spec 19.1). Unset =
    // the plan is simply unmapped; see `planIdForPriceId` in features/billing.
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_PRICE_BUSINESS: z.string().optional(),
    // Selects the storage adapter implementation (spec 21.1). Defaults to "none"
    // so the boilerplate builds and runs with zero object-storage configuration:
    // the adapter factory runs at module load, so a default that could throw would
    // break `next build` for everyone (same reason BILLING_PROVIDER defaults to
    // "none"). "none" makes the upload/file routes answer 404.
    STORAGE_PROVIDER: z.enum(["none", "s3"]).default("none"),
    // Only required when STORAGE_PROVIDER=s3; the s3 adapter throws a clear error
    // at construction if selected without S3_BUCKET / credentials. The interface
    // is S3-compatible, so ONE adapter serves AWS S3, Cloudflare R2, Backblaze B2
    // and MinIO (spec 21.1 / 25) — the differences are entirely in these vars.
    //
    // S3_ENDPOINT: custom endpoint for non-AWS S3 (MinIO "http://localhost:9000",
    // R2, B2). Unset = real AWS S3 for the given region.
    S3_ENDPOINT: z.string().optional(),
    // Region. AWS needs the real region; MinIO ignores it but the SDK requires a
    // value, so this defaults rather than being optional.
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    // Path-style addressing ("endpoint/bucket/key" rather than the virtual-hosted
    // "bucket.endpoint/key"). MinIO needs it; set true for local dev.
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    // Base URL used to build the STABLE public URL for public-visibility files
    // (spec 21.3). Unset = derived from endpoint+bucket (path-style). Set it when a
    // CDN or custom domain fronts the bucket.
    S3_PUBLIC_URL: z.string().optional(),
  },
  // Server vars are read straight from process.env in the Node runtime.
  experimental__runtimeEnv: {},
  // Treat empty strings as "missing" rather than valid empty values.
  emptyStringAsUndefined: true,
  // Escape hatch for CI/tooling that only needs types, not a real env.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
