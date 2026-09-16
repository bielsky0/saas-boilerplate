/**
 * Rate-limit adapter (spec 1.2, 2.1, 22.3 — pluggable counter store).
 *
 * Fifth reference adapter alongside `../auth`, `../billing`, `../email` and
 * `../storage`. Callers import the singleton `rateLimit` and the contract types;
 * nothing outside this directory knows whether counting happens in a Map or in
 * Postgres. The provider is chosen at startup by `RATE_LIMIT_PROVIDER`.
 *
 * Only two callers exist by design, and both are chokepoints rather than feature
 * code: `src/proxy.ts` (every /api request — §22.3) and
 * `src/features/auth/actions.ts` (the sign-in server action — §2.1, which the
 * proxy cannot see because server actions POST to a page URL).
 *
 * Neither provider throws at construction — memory allocates a Map, postgres
 * closes over `db` — so the "default provider must never throw at module load, or
 * it breaks `next build`" rule (docs/ARCHITECTURE.md) holds trivially, the same
 * way it does for JOBS_PROVIDER.
 *
 * A `redis` member is the natural third and is deliberately absent: see the
 * fixed-window note in `./contract.ts` for what it would buy.
 */

import { env } from "@/lib/env/server";
import type { RateLimitAdapter } from "./contract";
import { memoryRateLimitAdapter } from "./memory";
import { postgresRateLimitAdapter } from "./postgres";

function createRateLimitAdapter(): RateLimitAdapter {
  switch (env.RATE_LIMIT_PROVIDER) {
    case "postgres":
      return postgresRateLimitAdapter;
    case "memory":
    default:
      return memoryRateLimitAdapter;
  }
}

export const rateLimit: RateLimitAdapter = createRateLimitAdapter();

export { memoryRateLimitAdapter } from "./memory";
export { postgresRateLimitAdapter } from "./postgres";
export type { RateLimitAdapter, RateLimitDecision, RateLimitRule } from "./contract";
