import { Global, Module } from "@nestjs/common";

import type { RateLimitAdapter, RateLimitRule } from "@repo/contracts";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import type { Db } from "@repo/db";
import { createMemoryRateLimitAdapter } from "./memory";
import { createPostgresRateLimitAdapter } from "./postgres";

/**
 * Rate-limit stores (spec 2.1 / 22.3) — the Nest twin of the web app's
 * `src/lib/adapters/rate-limit` singleton.
 *
 * Provides the CONFIGURED store as `RATE_LIMIT` (chosen by
 * `RATE_LIMIT_PROVIDER`), both implementations individually (the dev seam
 * drives either one regardless of configuration), and the §2.1 login rule as
 * `LOGIN_RULE` — one policy object shared by every auth flow, so the numbers
 * cannot drift between call sites.
 */

export const RATE_LIMIT = Symbol("RATE_LIMIT");
export const RATE_LIMIT_MEMORY = Symbol("RATE_LIMIT_MEMORY");
export const RATE_LIMIT_POSTGRES = Symbol("RATE_LIMIT_POSTGRES");
export const LOGIN_RULE = Symbol("LOGIN_RULE");

@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_MEMORY,
      useFactory: (): RateLimitAdapter => createMemoryRateLimitAdapter(),
    },
    {
      provide: RATE_LIMIT_POSTGRES,
      useFactory: (db: Db): RateLimitAdapter => createPostgresRateLimitAdapter(db),
      inject: [DB],
    },
    {
      // Returns one of the singletons above — never a fresh instance. The dev
      // seam drives `RATE_LIMIT_MEMORY`/`RATE_LIMIT_POSTGRES` directly, so a
      // second Map here would silently split the store the limiter counts in.
      provide: RATE_LIMIT,
      useFactory: (
        config: ApiConfig,
        memory: RateLimitAdapter,
        postgres: RateLimitAdapter,
      ): RateLimitAdapter => (config.RATE_LIMIT_PROVIDER === "postgres" ? postgres : memory),
      inject: [API_CONFIG, RATE_LIMIT_MEMORY, RATE_LIMIT_POSTGRES],
    },
    {
      provide: LOGIN_RULE,
      useFactory: (config: ApiConfig): RateLimitRule => ({
        limit: config.RATE_LIMIT_LOGIN_ATTEMPTS,
        windowMs: config.RATE_LIMIT_LOGIN_WINDOW_S * 1000,
      }),
      inject: [API_CONFIG],
    },
  ],
  exports: [RATE_LIMIT, RATE_LIMIT_MEMORY, RATE_LIMIT_POSTGRES, LOGIN_RULE],
})
export class RateLimitModule {}
