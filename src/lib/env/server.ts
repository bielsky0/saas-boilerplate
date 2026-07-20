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
    //
    // This must point at the UNPRIVILEGED role (`saas_school` locally), not at a
    // superuser and not at the schema owner. Row-Level Security is bypassed
    // outright by a superuser and by a table's owner unless FORCE is set, so
    // pointing this at `postgres` would leave every policy decorative while
    // looking correctly configured — the failure mode US-1.1/AC1 exists to catch.
    // e2e/langlion-rls.spec.ts asserts the connected role really is neither.
    //
    // Its counterpart, DATABASE_MIGRATION_URL (the owner, used for DDL), is
    // deliberately absent from this schema so the running app cannot read it; it
    // lives only in drizzle.config.ts. See docs/ARCHITECTURE.md "Two database URLs".
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
    // Root domain academies live under (langlion §2.27): `{subdomain}.langlion.pl`.
    // `langlion.pl` in production, `localtest.me` in dev/E2E (a public name that
    // resolves to 127.0.0.1, so wildcard subdomains work without /etc/hosts).
    //
    // Deliberately a RUNTIME variable, unlike NEXT_PUBLIC_APP_URL, which is
    // inlined at build time and therefore freezes one image to one domain (see
    // src/lib/site.ts). Host recognition must not inherit that constraint: it is
    // read per request by src/proxy.ts via `parseHost`.
    APP_ROOT_DOMAIN: z.string().min(1).default("localhost"),
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
    // Security headers / CSP (spec 22.1). Defaults to "enforce" because a policy
    // that ships disabled is a policy nobody notices is broken — the E2E suite
    // proves the app renders under it before merge, so enforcing is the honest
    // default rather than an aspiration. "report-only" swaps the header name to
    // Content-Security-Policy-Report-Only (violations logged by the browser,
    // nothing blocked) and exists so an operator adding a third-party integration
    // can diagnose without redeploying code; "off" omits the CSP header entirely.
    // The four static headers from next.config.ts are set in ALL three modes.
    CSP_MODE: z.enum(["enforce", "report-only", "off"]).default("enforce"),
    // Space-separated extra CSP sources, appended to the matching directive
    // (spec 22.1: "every new external integration requires a deliberate addition
    // to the list, not automatic permission"). Empty by default — the boilerplate
    // ships with no third-party origins. The bucket origin is NOT configured here:
    // it is derived from the S3_* block above, so storage works in every
    // deployment without a second place to keep in sync. See src/lib/security/csp.ts.
    //
    // ⚠️ CSP_EXTRA_SCRIPT_SRC: script-src uses 'strict-dynamic', which makes
    // browsers that support it IGNORE host allowlists in that directive. A host
    // added here only helps legacy browsers; the modern path is for a nonced
    // script to load the third party, which 'strict-dynamic' already permits.
    CSP_EXTRA_SCRIPT_SRC: z.string().default(""),
    CSP_EXTRA_STYLE_SRC: z.string().default(""),
    CSP_EXTRA_CONNECT_SRC: z.string().default(""),
    CSP_EXTRA_IMG_SRC: z.string().default(""),
    // Rate limiting (spec 2.1 / 22.3). Tri-state like CSP_MODE, but note the
    // rationale is INVERTED: a CSP that ships disabled is a policy nobody notices
    // is broken, so it defaults to enforce as an honesty measure. A rate limit
    // that ships too TIGHT is an outage, so "report-only" exists as the TUNING
    // mode — it counts, emits the RateLimit-* headers and logs every would-be
    // block, but never answers 429. That is the safe way to change the tier table
    // in src/lib/security/rate-limit.ts. "off" skips counting entirely.
    //
    // Still defaults to "enforce": 5 failed sign-ins per 15 minutes is not a limit
    // any real user reaches, and the E2E suite proves the app works under it.
    RATE_LIMIT_MODE: z.enum(["enforce", "report-only", "off"]).default("enforce"),
    // Selects the rate-limit store (spec 22.3). "memory" is the default because
    // the adapter factory runs at module load and the default must never throw
    // (same reason BILLING_PROVIDER defaults to "none") — a Map cannot throw and
    // needs no migration.
    //
    // ⚠️ KNOW WHAT THE DEFAULT COSTS YOU. "memory" counts PER PROCESS. Behind N
    // instances (Vercel, any horizontally scaled deploy) each counts separately,
    // so the effective limit is N x the configured limit. Use "postgres" there:
    // one shared counter, one atomic statement, the database's clock as the single
    // source of truth. It needs `pnpm db:migrate`.
    //
    // A "redis" member is the natural third — it is where a true sliding window
    // (rather than this fixed window) belongs. Deliberately not built: it would
    // add a dependency and a container for a precision nothing here needs yet.
    RATE_LIMIT_PROVIDER: z.enum(["memory", "postgres"]).default("memory"),
    // ⚠️ THE SECURITY-CRITICAL ONE. How many reverse proxies sit in front of this
    // app. The client IP is taken this many entries from the RIGHT of
    // X-Forwarded-For, because the LEFT end of that header is whatever the client
    // typed. Get this wrong and the limiter is bypassable by rotating one header,
    // i.e. decorative. 1 is correct on Vercel and behind a single nginx; 0 means
    // nothing proxies the app. See src/lib/security/client-ip.ts.
    RATE_LIMIT_FORWARDED_DEPTH: z.coerce.number().int().min(0).default(1),
    // Spec 2.1's "blokada po 5 nieudanych próbach ... w oknie czasowym". These two
    // are env — unlike the general tiers, which are code — because they are the
    // §2.1 policy an operator tunes, and because the E2E suite pins them to prove
    // the limit exists at its production values.
    RATE_LIMIT_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_LOGIN_WINDOW_S: z.coerce.number().int().positive().default(900),
    // Multi-tenancy (spec 1.4). Tri-state like CSP_MODE / RATE_LIMIT_MODE, read
    // ONCE at startup — see src/lib/tenancy.ts, its only consumer.
    //
    // ⚠️ THIS FLAG IS COSMETIC BY CONTRACT. It changes what the UI OFFERS, never
    // what the data model supports. Every business row still carries
    // organization_id XOR account_id (§1.3); "disabled" means the app never
    // CREATES an organization and never SHOWS one, not that the data layer
    // stopped understanding them. That is what makes the switch reversible with
    // zero migration: turning it back on uncovers UI that was already there,
    // over rows that were never touched.
    //
    // "required" (the default for this boilerplate): §3-§4 in full — personal
    //   account and organizations both visible, the switcher always present.
    // "optional": organizations still work, but the main flow never pushes you
    //   into one. Personal is the default context; /orgs/new stays reachable by
    //   direct URL and is simply not advertised.
    // "disabled": pure B2C. /orgs/* and /invitations/* answer 404, every org
    //   server action refuses, and the switcher/CTAs are gone. Existing org rows
    //   are retained and untouched — just unreachable from the tenant UI.
    MULTI_TENANCY_MODE: z.enum(["required", "optional", "disabled"]).default("required"),
  },
  // Server vars are read straight from process.env in the Node runtime.
  experimental__runtimeEnv: {},
  // Treat empty strings as "missing" rather than valid empty values.
  emptyStringAsUndefined: true,
  // Escape hatch for CI/tooling that only needs types, not a real env.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
