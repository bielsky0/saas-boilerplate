import { createEnv } from "@t3-oss/env-nextjs";

/**
 * Client-side environment schema (spec 19.1 — fail-fast configuration).
 *
 * Only variables prefixed with `NEXT_PUBLIC_` may live here — these are the
 * values that get inlined into the browser bundle. Because Next.js statically
 * replaces `process.env.NEXT_PUBLIC_*` at build time, every such variable must
 * be listed explicitly in `runtimeEnv` below.
 *
 * There are no public variables yet; add them here (e.g. an analytics key) as
 * feature modules need them. Server-only secrets belong in `./server.ts`.
 */
export const clientEnv = createEnv({
  client: {},
  runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
