/**
 * Storage E2E env (spec 21 / 25).
 *
 * Spread into the web server's env by playwright.config.ts so the suite exercises
 * the REAL S3 adapter against MinIO — the presigned round-trip, the bucket's
 * public/private policy, everything the acceptance criteria assert. It runs
 * offline because MinIO is a local container (`pnpm db:up` / the CI service), not
 * a cloud account.
 *
 * The endpoint/creds/bucket here MUST match docker-compose.yml's `minio` +
 * `minio_init` services, and the bucket must have `public/` set anonymous-download
 * (minio_init does this) for the public-file path to work.
 *
 * Imported by playwright.config.ts, so it must NOT import `@playwright/test`.
 */
export const E2E_STORAGE_ENV = {
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "saas-boilerplate",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
} as const;
