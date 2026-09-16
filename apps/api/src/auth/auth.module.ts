import { Module } from "@nestjs/common";

import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { AUTH_ENGINE, createAuthEngine } from "./auth-engine";
import type { Db } from "@repo/db";

/**
 * Auth module (session reads only, this phase).
 *
 * Provides the Better Auth engine bound to the shared Drizzle client and the
 * same secret the web app signs sessions with. Feature modules inject
 * `AUTH_ENGINE_TOKEN` (via `SessionGuard`) — they never touch the SDK, the
 * same boundary `src/lib/adapters/auth` draws in web (spec 1.2).
 *
 * Sign-up/sign-in/verification stay in web until the auth module moves in
 * full (etap 2): this engine mints nothing, it only READS sessions minted
 * there. Cookie attributes were set at sign-in time by web; reading needs
 * only the secret + the database.
 */
@Module({
  providers: [
    {
      provide: AUTH_ENGINE,
      useFactory: (db: Db, config: ApiConfig) => createAuthEngine(db, config.BETTER_AUTH_SECRET),
      inject: [DB, API_CONFIG],
    },
  ],
  exports: [AUTH_ENGINE],
})
export class AuthModule {}
