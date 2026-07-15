import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Client-side environment schema (spec 19.1 — fail-fast configuration).
 *
 * Only variables prefixed with `NEXT_PUBLIC_` may live here — these are the
 * values that get inlined into the browser bundle. Because Next.js statically
 * replaces `process.env.NEXT_PUBLIC_*` at build time, every such variable must
 * be listed explicitly in `runtimeEnv` below.
 *
 * Server-only secrets belong in `./server.ts`.
 */
export const clientEnv = createEnv({
  client: {
    // Public base URL of the app. Used by the browser auth client (`baseURL`)
    // and to build redirect/callback URLs. Must also be listed in runtimeEnv.
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
