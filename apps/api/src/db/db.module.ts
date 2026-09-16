import { Global, Module } from "@nestjs/common";
import { createDb, type Db } from "@repo/db";

import { loadConfig, type ApiConfig } from "../common/config";

export const API_CONFIG = Symbol("API_CONFIG");
export const DB = Symbol("DB");

/**
 * Shared application wiring: validated config + the single Drizzle client.
 *
 * `@Global()` so feature modules inject without importing — the same role
 * `src/lib/db` plays in the web app. There is exactly one connection pool
 * per API process; transactions never cross the process boundary (the web
 * app holds no `tx`, it sends one HTTP request per operation and Nest opens
 * the transaction around the whole effect: business write + audit + enqueue).
 */
@Global()
@Module({
  providers: [
    {
      provide: API_CONFIG,
      useFactory: (): ApiConfig => loadConfig(),
    },
    {
      provide: DB,
      useFactory: (config: ApiConfig): Db => createDb(config.DATABASE_URL),
      inject: [API_CONFIG],
    },
  ],
  exports: [API_CONFIG, DB],
})
export class DbModule {}
